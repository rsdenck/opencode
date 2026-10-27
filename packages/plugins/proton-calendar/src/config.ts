import type { PluginOptions } from "@opencode/plugin"

export type CalendarSource =
  | { readonly kind: "url"; readonly url: string }
  | { readonly kind: "file"; readonly path: string }

export interface CalendarConfig {
  readonly source: CalendarSource
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

/**
 * Proton share links are sometimes copied as webcal://, which is not a
 * fetchable scheme. Everything else is passed through so self-hosted feeds and
 * local test servers keep working.
 */
export function normalizeShareUrl(value: string): string {
  const url = new URL(value.trim().replace(/^webcals?:\/\//i, "https://"))
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`Unsupported calendar URL scheme ${url.protocol}. Use an https:// or webcal:// share link.`)
  }
  return url.toString()
}

/**
 * Proton Calendar has no CalDAV endpoint. The only machine-readable source is
 * the read-only ICS share link (or an exported .ics file).
 */
export function calendarConfig(options: PluginOptions): CalendarConfig {
  const url = readString(options.url) ?? readString(process.env.PROTON_CALENDAR_URL)
  const path = readString(options.path) ?? readString(process.env.PROTON_CALENDAR_ICS)

  if (!url && !path) {
    throw new Error(
      "Proton Calendar source is missing. In Proton Calendar open Settings, choose the calendar, enable sharing by link, and copy the ICS link, then set the plugin option url or the PROTON_CALENDAR_URL environment variable. An exported .ics file works too via the path option or PROTON_CALENDAR_ICS.",
    )
  }

  return {
    source: url ? { kind: "url", url: normalizeShareUrl(url) } : { kind: "file", path: path! },
    cacheTtlMs:
      readNumber(options.cacheTtlMs) ?? readNumber(process.env.PROTON_CALENDAR_CACHE_TTL_MS) ?? defaults.cacheTtlMs,
    timeoutMs: readNumber(options.timeoutMs) ?? defaults.timeoutMs,
  }
}

/**
 * Share links are credentials: anyone holding one can read the calendar. Report
 * only the host so tool output is safe to keep in a transcript.
 */
export function describeSource(source: CalendarSource): string {
  if (source.kind === "file") return source.path
  return new URL(source.url).host
}
