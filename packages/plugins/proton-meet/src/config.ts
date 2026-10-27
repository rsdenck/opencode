import type { PluginOptions } from "@opencode/plugin"

export type MeetSource =
  | { readonly kind: "url"; readonly url: string }
  | { readonly kind: "file"; readonly path: string }

export interface MeetConfig {
  readonly source: MeetSource
  readonly cacheTtlMs: number
  readonly timeoutMs: number
}

const defaults = {
  cacheTtlMs: 600_000,
  timeoutMs: 30_000,
} as const

const readString = (value: unknown) => (typeof value === "string" && value.length > 0 ? value : undefined)

const readNumber = (value: unknown) => {
  const number = typeof value === "number" ? value : Number(value)
  return Number.isFinite(number) && number > 0 ? number : undefined
}

/** Proton share links are sometimes copied as webcal://, which is not fetchable. */
export function normalizeShareUrl(value: string): string {
  const url = new URL(value.trim().replace(/^webcals?:\/\//i, "https://"))
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`Unsupported calendar URL scheme ${url.protocol}. Use an https:// or webcal:// share link.`)
  }
  return url.toString()
}

/**
 * Proton Meet has no API of its own: meeting rooms are created by Proton
 * Calendar and their links only exist inside calendar events. This plugin reads
 * the same ICS source the calendar plugin uses, so both plugins can share one
 * configuration.
 */
export function meetConfig(options: PluginOptions): MeetConfig {
  const url =
    readString(options.url) ??
    readString(process.env.PROTON_MEET_URL) ??
    readString(process.env.PROTON_CALENDAR_URL)
  const path =
    readString(options.path) ??
    readString(process.env.PROTON_MEET_ICS) ??
    readString(process.env.PROTON_CALENDAR_ICS)

  if (!url && !path) {
    throw new Error(
      "Proton Meet source is missing. Meeting rooms live inside calendar events, so point the plugin at the same ICS the calendar plugin uses: set the url option or PROTON_CALENDAR_URL (a read-only share link from Proton Calendar settings), or the path option or PROTON_CALENDAR_ICS (an exported .ics file).",
    )
  }

  return {
    source: url ? { kind: "url", url: normalizeShareUrl(url) } : { kind: "file", path: path! },
    cacheTtlMs: readNumber(options.cacheTtlMs) ?? readNumber(process.env.PROTON_CALENDAR_CACHE_TTL_MS) ?? defaults.cacheTtlMs,
    timeoutMs: readNumber(options.timeoutMs) ?? defaults.timeoutMs,
  }
}

/** Share links are credentials: report only the host so transcripts stay safe. */
export function describeSource(source: MeetSource): string {
  if (source.kind === "file") return source.path
  return new URL(source.url).host
}
