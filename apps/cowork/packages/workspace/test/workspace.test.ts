import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { CoworkError } from "@cowork/core"
import { afterEach, describe, expect, it } from "vitest"
import {
  diffSnapshots,
  listDirectory,
  readTextFile,
  relativeToRoot,
  resolveInsideRoot,
  resolveWorkspacePath,
  snapshotWorkspace,
} from "../src/index.js"

const directories: string[] = []

function makeDir(prefix = "cowork-workspace-"): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  directories.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true })
})

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  try {
    await promise
    expect.unreachable(`Expected ${code}`)
  } catch (error) {
    expect(error).toBeInstanceOf(CoworkError)
    expect((error as CoworkError).code).toBe(code)
  }
}

describe("workspace registration", () => {
  it("resolves absolute directories to their real path", async () => {
    const dir = makeDir()
    const link = `${dir}-link`
    symlinkSync(dir, link)
    directories.push(link)
    const resolved = await resolveWorkspacePath(link)
    expect(resolved.path).toBe(dir)
    expect(resolved.name.length).toBeGreaterThan(0)
  })

  it("rejects relative, missing, non-directory and forbidden paths", async () => {
    await expectCode(resolveWorkspacePath("relative/path"), "workspace_path_not_absolute")
    await expectCode(resolveWorkspacePath("/definitely/not/here"), "workspace_not_found")
    const file = join(makeDir(), "file.txt")
    writeFileSync(file, "hello")
    await expectCode(resolveWorkspacePath(file), "workspace_not_directory")
    await expectCode(resolveWorkspacePath("/etc"), "workspace_path_forbidden")
    await expectCode(resolveWorkspacePath("/"), "workspace_path_forbidden")
  })
})

describe("path isolation", () => {
  it("blocks lexical traversal and absolute escapes", async () => {
    const root = makeDir()
    await expectCode(resolveInsideRoot(root, "../outside"), "path_traversal")
    await expectCode(resolveInsideRoot(root, "../../etc/passwd"), "path_traversal")
    await expectCode(resolveInsideRoot(root, "/etc/passwd"), "path_traversal")
    expect(await resolveInsideRoot(root, "")).toBe(root)
    expect(await resolveInsideRoot(root, ".")).toBe(root)
  })

  it("allows nested paths and new files inside the root", async () => {
    const root = makeDir()
    mkdirSync(join(root, "src"))
    writeFileSync(join(root, "src", "app.ts"), "export {}")
    expect(await resolveInsideRoot(root, "src/app.ts")).toBe(join(root, "src", "app.ts"))
    expect(await resolveInsideRoot(root, "src/new-file.ts")).toBe(join(root, "src", "new-file.ts"))
  })

  it("blocks symlink escapes even when the link is inside the root", async () => {
    const root = makeDir()
    const outside = makeDir()
    writeFileSync(join(outside, "secret.txt"), "top secret")
    symlinkSync(outside, join(root, "escape"))
    await expectCode(resolveInsideRoot(root, "escape/secret.txt"), "symlink_escape")
    await expectCode(resolveInsideRoot(root, "escape"), "symlink_escape")
  })

  it("allows symlinks that stay inside the root", async () => {
    const root = makeDir()
    mkdirSync(join(root, "real"))
    symlinkSync(join(root, "real"), join(root, "alias"))
    expect(await resolveInsideRoot(root, "alias")).toBe(join(root, "real"))
  })

  it("computes POSIX-style relative paths", () => {
    expect(relativeToRoot("/tmp/root", "/tmp/root/a/b.txt")).toBe("a/b.txt")
  })
})

describe("directory listing", () => {
  it("sorts directories first and marks symlinks", async () => {
    const root = makeDir()
    mkdirSync(join(root, "zeta"))
    writeFileSync(join(root, "alpha.txt"), "alpha")
    writeFileSync(join(root, ".hidden"), "hidden")
    symlinkSync(join(root, "alpha.txt"), join(root, "link.txt"))
    mkdirSync(join(root, "node_modules"))

    const listing = await listDirectory(root, "")
    expect(listing.path).toBe(".")
    expect(listing.entries.map((entry) => entry.name)).toEqual([
      "zeta",
      ".hidden",
      "alpha.txt",
      "link.txt",
    ])
    expect(listing.entries.find((entry) => entry.name === "link.txt")?.type).toBe("symlink")
    expect(listing.entries.some((entry) => entry.name === "node_modules")).toBe(false)
  })

  it("rejects files and traversal", async () => {
    const root = makeDir()
    writeFileSync(join(root, "file.txt"), "x")
    await expectCode(listDirectory(root, "file.txt"), "not_a_directory")
    await expectCode(listDirectory(root, "../"), "path_traversal")
  })
})

describe("file preview", () => {
  it("reads UTF-8 text and detects binary content", async () => {
    const root = makeDir()
    writeFileSync(join(root, "text.txt"), "hello world")
    writeFileSync(join(root, "binary.bin"), Buffer.from([1, 2, 0, 4]))
    const text = await readTextFile(root, "text.txt")
    expect(text).toMatchObject({ binary: false, content: "hello world", size: 11 })
    const binary = await readTextFile(root, "binary.bin")
    expect(binary).toMatchObject({ binary: true, content: null })
  })

  it("rejects directories, symlink escapes and oversized files", async () => {
    const root = makeDir()
    const outside = makeDir()
    writeFileSync(join(outside, "secret"), "secret")
    symlinkSync(join(outside, "secret"), join(root, "link"))
    mkdirSync(join(root, "dir"))
    writeFileSync(join(root, "big.txt"), Buffer.alloc(300 * 1024, 65))
    await expectCode(readTextFile(root, "dir"), "not_a_file")
    await expectCode(readTextFile(root, "link"), "symlink_escape")
    await expectCode(readTextFile(root, "big.txt"), "file_too_large")
  })
})

describe("snapshots", () => {
  it("hashes sizes/mtimes and diffs created, modified and deleted files", async () => {
    const root = makeDir()
    mkdirSync(join(root, "src"))
    writeFileSync(join(root, "src", "keep.txt"), "keep")
    writeFileSync(join(root, "remove.txt"), "remove")
    const before = await snapshotWorkspace(root)
    expect(before.fileCount).toBe(2)

    writeFileSync(join(root, "src", "keep.txt"), "keep changed")
    writeFileSync(join(root, "new.txt"), "new")
    rmSync(join(root, "remove.txt"))

    const after = await snapshotWorkspace(root)
    const changes = diffSnapshots(before, after)
    expect(changes.map((change) => `${change.change}:${change.path}`)).toEqual([
      "created:new.txt",
      "deleted:remove.txt",
      "modified:src/keep.txt",
    ])
  })

  it("skips ignored directories, symlinks and respects file limits", async () => {
    const root = makeDir()
    const outside = makeDir()
    writeFileSync(join(outside, "secret"), "secret")
    symlinkSync(outside, join(root, "outside"))
    symlinkSync(join(root, "target.txt"), join(root, "link.txt"))
    writeFileSync(join(root, "target.txt"), "target")
    mkdirSync(join(root, ".git"))
    writeFileSync(join(root, ".git", "config"), "x")
    mkdirSync(join(root, "node_modules"))
    writeFileSync(join(root, "node_modules", "package.json"), "{}")
    writeFileSync(join(root, "one.txt"), "1")
    writeFileSync(join(root, "two.txt"), "2")

    const snapshot = await snapshotWorkspace(root, { maxFiles: 1 })
    expect(Object.keys(snapshot.entries)).toHaveLength(1)
    expect(snapshot.truncated).toBe(true)
    expect(snapshot.fileCount).toBe(1)
  })
})
