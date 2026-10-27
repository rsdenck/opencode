import { lstat, open, readdir } from "node:fs/promises"
import { join } from "node:path"
import { CoworkError } from "@cowork/core"
import { relativeToRoot, resolveInsideRoot } from "./paths.js"

const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".hg",
  ".svn",
  "node_modules",
  ".cache",
  ".venv",
  "venv",
  "__pycache__",
  ".next",
  ".turbo",
  "coverage",
])

export interface SnapshotEntry {
  size: number
  mtime: number
}

export interface Snapshot {
  root: string
  entries: Record<string, SnapshotEntry>
  truncated: boolean
  fileCount: number
  takenAt: number
}

export interface SnapshotDiffEntry {
  path: string
  change: "created" | "modified" | "deleted"
  size: number
  mtime: number
}

export async function snapshotWorkspace(
  root: string,
  options: { maxFiles?: number; maxDepth?: number } = {},
): Promise<Snapshot> {
  const maxFiles = options.maxFiles ?? 5000
  const maxDepth = options.maxDepth ?? 24
  const entries: Record<string, SnapshotEntry> = {}
  let fileCount = 0
  let truncated = false

  const stack: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }]
  while (stack.length > 0) {
    const current = stack.pop()
    if (!current) break
    let items: import("node:fs").Dirent[]
    try {
      items = await readdir(current.dir, { withFileTypes: true, encoding: "utf8" })
    } catch {
      continue
    }

    for (const item of items) {
      const absolute = join(current.dir, item.name)
      const rel = relativeToRoot(root, absolute)
      if (item.isSymbolicLink()) continue
      if (item.isDirectory()) {
        if (IGNORED_DIRECTORIES.has(item.name)) continue
        if (current.depth + 1 > maxDepth) {
          truncated = true
          continue
        }
        stack.push({ dir: absolute, depth: current.depth + 1 })
        continue
      }
      if (!item.isFile()) continue
      if (fileCount >= maxFiles) {
        truncated = true
        break
      }
      try {
        const info = await lstat(absolute)
        entries[rel] = { size: info.size, mtime: Math.floor(info.mtimeMs) }
        fileCount++
      } catch {
        // File disappeared during the scan; skip it.
      }
    }
    if (fileCount >= maxFiles) {
      truncated = true
      break
    }
  }

  return { root, entries, truncated, fileCount, takenAt: Date.now() }
}

export function diffSnapshots(before: Snapshot, after: Snapshot): SnapshotDiffEntry[] {
  const changes: SnapshotDiffEntry[] = []
  for (const [path, entry] of Object.entries(after.entries)) {
    const previous = before.entries[path]
    if (!previous) {
      changes.push({ path, change: "created", size: entry.size, mtime: entry.mtime })
    } else if (previous.size !== entry.size || previous.mtime !== entry.mtime) {
      changes.push({ path, change: "modified", size: entry.size, mtime: entry.mtime })
    }
  }
  for (const [path, entry] of Object.entries(before.entries)) {
    if (!after.entries[path]) {
      changes.push({ path, change: "deleted", size: entry.size, mtime: entry.mtime })
    }
  }
  return changes.sort((a, b) => a.path.localeCompare(b.path))
}

export interface DirectoryEntry {
  name: string
  path: string
  type: "file" | "directory" | "symlink" | "other"
  size: number
  mtime: number
}

export async function listDirectory(
  root: string,
  relativePath: string,
  options: { limit?: number } = {},
): Promise<{ path: string; entries: DirectoryEntry[]; truncated: boolean }> {
  const absolute = await resolveInsideRoot(root, relativePath)
  const info = await lstat(absolute)
  if (!info.isDirectory()) {
    throw new CoworkError("not_a_directory", "Requested path is not a directory", { status: 400 })
  }

  const limit = options.limit ?? 1000
  const items = await readdir(absolute, { withFileTypes: true })
  const entries: DirectoryEntry[] = []
  for (const item of items) {
    if (entries.length >= limit) break
    if (IGNORED_DIRECTORIES.has(item.name)) continue
    const itemPath = join(absolute, item.name)
    let itemInfo: Awaited<ReturnType<typeof lstat>> | null = null
    try {
      itemInfo = await lstat(itemPath)
    } catch {
      continue
    }
    const type: DirectoryEntry["type"] = item.isSymbolicLink()
      ? "symlink"
      : item.isDirectory()
        ? "directory"
        : item.isFile()
          ? "file"
          : "other"
    entries.push({
      name: item.name,
      path: relativeToRoot(root, itemPath),
      type,
      size: itemInfo.size,
      mtime: Math.floor(itemInfo.mtimeMs),
    })
  }
  entries.sort((a, b) => {
    if (a.type === "directory" && b.type !== "directory") return -1
    if (a.type !== "directory" && b.type === "directory") return 1
    return a.name.localeCompare(b.name)
  })
  return {
    path: relativeToRoot(root, absolute) || ".",
    entries,
    truncated: items.length > entries.length,
  }
}

const MAX_PREVIEW_BYTES = 256 * 1024

export async function readTextFile(
  root: string,
  relativePath: string,
): Promise<{ path: string; size: number; binary: boolean; content: string | null }> {
  const absolute = await resolveInsideRoot(root, relativePath)
  // Open once and inspect the file descriptor: avoids a check-then-read race
  // where the path could be replaced between stat and read.
  const handle = await open(absolute, "r")
  try {
    const info = await handle.stat()
    if (!info.isFile()) {
      throw new CoworkError("not_a_file", "Requested path is not a file", { status: 400 })
    }
    if (info.size > MAX_PREVIEW_BYTES) {
      throw new CoworkError("file_too_large", "File exceeds the preview size limit", {
        status: 413,
        details: { size: info.size, limit: MAX_PREVIEW_BYTES },
      })
    }

    const buffer = await handle.readFile()
    if (buffer.includes(0)) {
      return { path: relativeToRoot(root, absolute), size: info.size, binary: true, content: null }
    }
    return {
      path: relativeToRoot(root, absolute),
      size: info.size,
      binary: false,
      content: buffer.toString("utf8"),
    }
  } finally {
    await handle.close()
  }
}
