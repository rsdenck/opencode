import { realpath, stat } from "node:fs/promises"
import { basename, isAbsolute, relative, resolve, sep } from "node:path"
import { CoworkError } from "@cowork/core"

/**
 * Directories that are never accepted as a workspace root. This is a safety
 * baseline, not a sandbox: OpenCode itself runs as the current OS user.
 */
const FORBIDDEN_ROOTS = new Set([
  "/",
  "/bin",
  "/boot",
  "/dev",
  "/etc",
  "/lib",
  "/lib64",
  "/proc",
  "/root",
  "/run",
  "/sbin",
  "/sys",
  "/usr",
  "/var",
])

export interface ResolvedWorkspace {
  path: string
  name: string
}

export async function resolveWorkspacePath(input: string): Promise<ResolvedWorkspace> {
  if (!input || input.trim().length === 0) {
    throw new CoworkError("workspace_path_required", "A workspace path is required")
  }
  if (!isAbsolute(input)) {
    throw new CoworkError("workspace_path_not_absolute", "Workspace path must be absolute")
  }

  const candidate = resolve(input)
  let real: string
  try {
    real = await realpath(candidate)
  } catch {
    throw new CoworkError("workspace_not_found", `Workspace path does not exist: ${candidate}`, {
      status: 404,
    })
  }

  if (FORBIDDEN_ROOTS.has(real)) {
    throw new CoworkError(
      "workspace_path_forbidden",
      `Refusing to use system directory as workspace: ${real}`,
    )
  }

  const info = await stat(real)
  if (!info.isDirectory()) {
    throw new CoworkError("workspace_not_directory", `Workspace path is not a directory: ${real}`)
  }

  return { path: real, name: basename(real) || real }
}

function isInside(root: string, target: string): boolean {
  const rel = relative(root, target)
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel))
}

/**
 * Resolves a user-supplied path against a workspace root, following symlinks
 * for the existing part of the path. Rejects traversal outside the root.
 */
export async function resolveInsideRoot(root: string, input: string): Promise<string> {
  const normalizedRoot = resolve(root)
  const target = resolve(normalizedRoot, input || ".")

  // Lexical traversal check first (handles `..`).
  if (!isInside(normalizedRoot, target)) {
    throw new CoworkError("path_traversal", "Path escapes the workspace root", {
      status: 403,
      details: { root: normalizedRoot, requested: input },
    })
  }
  if (target === normalizedRoot) return normalizedRoot

  // Walk up to the closest existing ancestor, then rebuild the missing suffix.
  let probe = target
  const missing: string[] = []
  for (let i = 0; i < 64; i++) {
    try {
      const real = await realpath(probe)
      const reconstructed = missing.length > 0 ? resolve(real, ...missing.reverse()) : real
      if (!isInside(normalizedRoot, reconstructed)) {
        throw new CoworkError("symlink_escape", "Path resolves outside the workspace root", {
          status: 403,
          details: { root: normalizedRoot, requested: input },
        })
      }
      return reconstructed
    } catch (error) {
      if (error instanceof CoworkError) throw error
      const parent = resolve(probe, "..")
      if (parent === probe || !isInside(normalizedRoot, parent)) break
      missing.push(basename(probe))
      probe = parent
    }
  }

  throw new CoworkError("path_unresolvable", "Unable to resolve path safely", {
    status: 400,
    details: { root: normalizedRoot, requested: input },
  })
}

export function relativeToRoot(root: string, target: string): string {
  const rel = relative(root, target)
  return rel.split(sep).join("/")
}
