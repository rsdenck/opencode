import type { PluginOptions } from "@opencode/plugin"

export type CatalogKind = "doc" | "sheet"

/**
 * Proton Docs and Sheets are Drive nodes with their own media types. They appear
 * in folder listings like any other file, but the Drive SDK refuses to transfer
 * their content, so this plugin can only describe them.
 */
export const DOC_MEDIA_TYPE = "application/vnd.proton.doc"
export const SHEET_MEDIA_TYPE = "application/vnd.proton.sheet"

export interface CatalogConfig {
  readonly binary: string
  readonly timeoutMs: number
  readonly mediaType: string
  readonly kind: CatalogKind
}

const defaults = {
  binary: "proton-drive",
  timeoutMs: 120_000,
} as const

const readString = (value: unknown) => (typeof value === "string" && value.length > 0 ? value : undefined)

const readNumber = (value: unknown) => {
  const number = typeof value === "number" ? value : Number(value)
  return Number.isFinite(number) && number > 0 ? number : undefined
}

export function catalogConfig(options: PluginOptions, mediaType: string, kind: CatalogKind): CatalogConfig {
  return {
    binary: readString(options.binary) ?? readString(process.env.PROTON_DRIVE_BIN) ?? defaults.binary,
    timeoutMs: readNumber(options.timeoutMs) ?? defaults.timeoutMs,
    mediaType,
    kind,
  }
}
