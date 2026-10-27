import type { PluginOptions } from "@opencode/plugin"

export interface DriveConfig {
  readonly binary: string
  readonly timeoutMs: number
  /**
   * The CLI prompts for conflict resolution over stdin, which a tool call
   * cannot answer. Pass a strategy so transfers always terminate.
   */
  readonly fileConflictStrategy: string
  readonly folderConflictStrategy: string
  readonly skipThumbnails: boolean
}

const defaults = {
  binary: "proton-drive",
  timeoutMs: 120_000,
  fileConflictStrategy: "rename",
  folderConflictStrategy: "rename",
  skipThumbnails: true,
} as const

const readString = (value: unknown) => (typeof value === "string" && value.length > 0 ? value : undefined)

const readTimeout = (value: unknown) => {
  const timeout = typeof value === "number" ? value : Number(value)
  return Number.isFinite(timeout) && timeout > 0 ? timeout : undefined
}

export function driveConfig(options: PluginOptions): DriveConfig {
  return {
    binary: readString(options.binary) ?? readString(process.env.PROTON_DRIVE_BIN) ?? defaults.binary,
    timeoutMs: readTimeout(options.timeoutMs) ?? defaults.timeoutMs,
    fileConflictStrategy: readString(options.fileConflictStrategy) ?? defaults.fileConflictStrategy,
    folderConflictStrategy: readString(options.folderConflictStrategy) ?? defaults.folderConflictStrategy,
    skipThumbnails: options.skipThumbnails !== false,
  }
}

/**
 * Parses the CLI's `--json` output. Older builds print human-readable text even
 * when asked for JSON, so callers fall back to the raw output instead of failing.
 */
export function parseJson(text: string): unknown | undefined {
  const trimmed = text.trim()
  if (trimmed.length === 0) return undefined
  if (trimmed[0] !== "{" && trimmed[0] !== "[") return undefined
  try {
    return JSON.parse(trimmed)
  } catch {
    return undefined
  }
}
