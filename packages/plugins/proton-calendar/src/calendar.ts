import ICAL from "ical.js"
import { describeSource } from "./config.js"
import type { CalendarConfig } from "./config.js"

type IcalTime = InstanceType<typeof ICAL.Time>
type IcalEvent = InstanceType<typeof ICAL.Event>

export interface CalendarInfo {
  name: string | null
  timezone: string | null
  events: number
  source: string
  fetchedAt: string
  readOnly: true
}

export interface CalendarEvent {
  uid: string
  summary: string
  description: string
  location: string
  start: string
  end: string
  allDay: boolean
  status: string | null
  organizer: string | null
  recurring: boolean
  recurrenceID: string | null
}

export interface EventQuery {
  from?: string
  to?: string
  limit?: number
  text?: string
}

const week = 7 * 24 * 60 * 60 * 1000

const cache = new Map<string, { text: string; at: number }>()

const sourceKey = (config: CalendarConfig) =>
  config.source.kind === "url" ? `url:${config.source.url}` : `file:${config.source.path}`

async function readSource(config: CalendarConfig) {
  const key = sourceKey(config)
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < config.cacheTtlMs) return hit

  const text = await fetchSource(config)
  const entry = { text, at: Date.now() }
  cache.set(key, entry)
  return entry
}

async function fetchSource(config: CalendarConfig) {
  if (config.source.kind === "file") {
    const file = Bun.file(config.source.path)
    if (!(await file.exists())) {
      throw new Error(
        `Calendar file not found at ${config.source.path}. In Proton Calendar choose the calendar, then Export, and point the path option or PROTON_CALENDAR_ICS at the downloaded .ics file.`,
      )
    }
    return file.text()
  }

  const response = await fetch(config.source.url, {
    headers: { accept: "text/calendar, text/plain;q=0.5" },
    redirect: "follow",
    signal: AbortSignal.timeout(config.timeoutMs),
  })
  if (!response.ok) {
    throw new Error(
      `Proton Calendar share link answered ${response.status}. Share links expire when the calendar stops being shared; copy a fresh ICS link from Proton Calendar settings.`,
    )
  }
  return response.text()
}

function parseCalendar(text: string) {
  if (text.trimStart().startsWith("<")) {
    throw new Error(
      "The calendar source returned HTML instead of iCalendar data. The share link is probably expired or password protected; copy a fresh ICS link from Proton Calendar settings.",
    )
  }
  try {
    return new ICAL.Component(ICAL.parse(text))
  } catch (cause) {
    throw new Error("The calendar source is not valid iCalendar data.", { cause })
  }
}

const pad = (value: number) => String(value).padStart(2, "0")

function formatTime(time: IcalTime) {
  if (time.isDate) return `${String(time.year).padStart(4, "0")}-${pad(time.month)}-${pad(time.day)}`
  return time.toJSDate().toISOString()
}

function textProperty(event: IcalEvent, name: string) {
  const value = event.component.getFirstPropertyValue(name)
  return typeof value === "string" ? value : ""
}

function toOccurrence(
  item: IcalEvent,
  start: IcalTime,
  end: IcalTime,
  recurrenceID: IcalTime | null,
  recurring: boolean,
): CalendarEvent {
  const organizer = item.component.getFirstPropertyValue("organizer")
  const status = item.component.getFirstPropertyValue("status")
  return {
    uid: item.uid,
    summary: textProperty(item, "summary"),
    description: textProperty(item, "description"),
    location: textProperty(item, "location"),
    start: formatTime(start),
    end: formatTime(end),
    allDay: start.isDate,
    status: typeof status === "string" ? status : null,
    organizer: typeof organizer === "string" ? organizer.replace(/^mailto:/i, "") : null,
    recurring,
    recurrenceID: recurrenceID ? formatTime(recurrenceID) : null,
  }
}

const occurrenceLimit = 2_000

function expand(event: IcalEvent, from: Date, to: Date): CalendarEvent[] {
  if (!event.isRecurring()) {
    if (event.startDate.toJSDate() > to) return []
    if (event.endDate.toJSDate() < from) return []
    return [toOccurrence(event, event.startDate, event.endDate, null, false)]
  }

  const occurrences: CalendarEvent[] = []
  const iterator = event.iterator()
  // Unbounded rules such as FREQ=SECONDLY need a hard stop that does not depend
  // on how many occurrences land inside the requested range.
  for (let step = 0; step < occurrenceLimit * 10; step++) {
    // ical.js returns undefined once the rule is exhausted, even though its
    // types say null.
    const next = iterator.next()
    if (!next) break
    const details = event.getOccurrenceDetails(next)
    if (details.startDate.toJSDate() > to) break
    if (details.endDate.toJSDate() < from) continue
    occurrences.push(
      toOccurrence(details.item, details.startDate, details.endDate, details.recurrenceId, true),
    )
    if (occurrences.length >= occurrenceLimit) break
  }
  return occurrences
}

/**
 * Expands a calendar into concrete occurrences, resolving RECURRENCE-ID
 * overrides and dropping EXDATE and CANCELLED instances.
 */
export function parseEvents(text: string, range: { from: Date; to: Date; limit: number; text?: string }): CalendarEvent[] {
  const root = parseCalendar(text)
  const masters: IcalEvent[] = []
  const exceptions: IcalEvent[] = []

  for (const component of root.getAllSubcomponents("vevent")) {
    const event = new ICAL.Event(component)
    if (component.hasProperty("recurrence-id")) exceptions.push(event)
    else masters.push(event)
  }

  // ical.js does not link overrides on its own; getOccurrenceDetails needs the
  // relation to substitute changed times, summaries, and cancellations.
  for (const exception of exceptions) masters.find((event) => event.uid === exception.uid)?.relateException(exception)

  const needle = range.text?.trim().toLowerCase()
  return masters
    .flatMap((event) => expand(event, range.from, range.to))
    .filter((event) => event.status !== "CANCELLED")
    .filter(
      (event) =>
        !needle ||
        [event.summary, event.description, event.location, event.organizer ?? ""].join(" ").toLowerCase().includes(needle),
    )
    .sort((left, right) => left.start.localeCompare(right.start))
    .slice(0, range.limit)
}

export async function calendarInfo(config: CalendarConfig): Promise<CalendarInfo> {
  const { text, at } = await readSource(config)
  const root = parseCalendar(text)
  const name = root.getFirstPropertyValue("x-wr-calname")
  const timezone = root.getFirstPropertyValue("x-wr-timezone")
  return {
    name: typeof name === "string" ? name : null,
    timezone: typeof timezone === "string" ? timezone : null,
    events: root.getAllSubcomponents("vevent").length,
    source: describeSource(config.source),
    fetchedAt: new Date(at).toISOString(),
    readOnly: true,
  }
}

export async function listEvents(config: CalendarConfig, query: EventQuery): Promise<CalendarEvent[]> {
  const now = new Date()
  const from = query.from ? new Date(query.from) : now
  const to = query.to ? new Date(query.to) : new Date(now.getTime() + week)

  if (Number.isNaN(from.getTime())) throw new Error(`Invalid from date "${query.from}". Use an ISO 8601 date or timestamp.`)
  if (Number.isNaN(to.getTime())) throw new Error(`Invalid to date "${query.to}". Use an ISO 8601 date or timestamp.`)
  if (from > to) throw new Error("The from date must not be after the to date.")

  const limit = Math.min(Math.max(Math.trunc(query.limit ?? 100), 1), 500)
  const { text } = await readSource(config)
  return parseEvents(text, { from, to, limit, text: query.text })
}
