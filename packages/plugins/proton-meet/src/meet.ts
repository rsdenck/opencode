import ICAL from "ical.js"
import { describeSource } from "./config.js"
import type { MeetConfig, MeetSource } from "./config.js"

type IcalTime = InstanceType<typeof ICAL.Time>
type IcalEvent = InstanceType<typeof ICAL.Event>

export interface MeetInfo {
  calendar: string | null
  events: number
  source: string
  fetchedAt: string
  readOnly: true
}

export interface MeetRoom {
  /** The link as it appears in the event, ready to open in a browser. */
  url: string
  /** The room code from a guest link's ?code= parameter, or the last path segment. */
  code: string | null
  /** Guest links let people join without a Proton account; room links do not carry one. */
  guest: boolean
}

export interface Meeting {
  summary: string
  start: string
  end: string
  allDay: boolean
  organizer: string | null
  room: MeetRoom
  recurring: boolean
}

export interface MeetingQuery {
  from?: string
  to?: string
  limit?: number
  text?: string
}

const week = 7 * 24 * 60 * 60 * 1000

const cache = new Map<string, { text: string; at: number }>()

const sourceKey = (config: MeetConfig) =>
  config.source.kind === "url" ? `url:${config.source.url}` : `file:${config.source.path}`

async function readSource(config: MeetConfig) {
  const key = sourceKey(config)
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < config.cacheTtlMs) return hit

  const text = await fetchSource(config)
  const entry = { text, at: Date.now() }
  cache.set(key, entry)
  return entry
}

async function fetchSource(config: MeetConfig) {
  if (config.source.kind === "file") {
    const file = Bun.file(config.source.path)
    if (!(await file.exists())) {
      throw new Error(
        `Calendar file not found at ${config.source.path}. Export the calendar from Proton Calendar and point the path option or PROTON_CALENDAR_ICS at the downloaded .ics file.`,
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
      `The calendar share link answered ${response.status}. Share links expire when the calendar stops being shared; copy a fresh ICS link from Proton Calendar settings.`,
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

const meetPattern = /https?:\/\/meet\.proton\.me\/[^\s"'<>)\]]+/i

/**
 * Meet links ride inside the event: either in the RFC 7986 CONFERENCE property
 * or as a URL in the URL, location, or description field.
 */
export function findMeet(event: IcalEvent): string | null {
  const conference = event.component.getFirstPropertyValue("conference")
  if (typeof conference === "string" && conference.length > 0) return conference

  const match = ["url", "location", "description"]
    .map((field) => textProperty(event, field).match(meetPattern))
    .find((value) => value !== null)
  return match ? match[0] : null
}

/**
 * Normalizes the two link shapes Proton Meet produces. A guest link carries the
 * room in its code= parameter; any other link falls back to its last path
 * segment. Parsing is local: whether a room is actually open is only visible
 * inside Proton Meet itself.
 */
export function parseRoom(link: string): MeetRoom {
  const url = link.trim()
  let code: string | null = null
  let guest = false

  try {
    const parsed = new URL(url)
    if (parsed.hostname.endsWith("meet.proton.me")) {
      guest = parsed.pathname.startsWith("/guest")
      code = parsed.searchParams.get("code")
      if (!code && !guest) {
        const tail = parsed.pathname.split("/").filter((segment) => segment.length > 0).pop()
        code = tail ?? null
      }
    }
  } catch {
    throw new Error(`"${url}" is not a URL. Pass a meet.proton.me link from a calendar event.`)
  }

  return { url, code, guest }
}

const occurrenceLimit = 2_000

interface Occurrence {
  event: IcalEvent
  start: IcalTime
  end: IcalTime
  recurring: boolean
}

function expand(event: IcalEvent, from: Date, to: Date): Occurrence[] {
  if (!event.isRecurring()) {
    if (event.startDate.toJSDate() > to) return []
    if (event.endDate.toJSDate() < from) return []
    return [{ event, start: event.startDate, end: event.endDate, recurring: false }]
  }

  const occurrences: Occurrence[] = []
  const iterator = event.iterator()
  // Unbounded rules need a hard stop independent of how many occurrences land
  // inside the requested range.
  for (let step = 0; step < occurrenceLimit * 10; step++) {
    // ical.js returns undefined once the rule is exhausted, even though its
    // types say null.
    const next = iterator.next()
    if (!next) break
    const details = event.getOccurrenceDetails(next)
    if (details.startDate.toJSDate() > to) break
    if (details.endDate.toJSDate() < from) continue
    occurrences.push({ event: details.item, start: details.startDate, end: details.endDate, recurring: true })
    if (occurrences.length >= occurrenceLimit) break
  }
  return occurrences
}

function toMeeting(occurrence: Occurrence): Meeting | null {
  const link = findMeet(occurrence.event)
  if (!link) return null

  const organizer = occurrence.event.component.getFirstPropertyValue("organizer")
  const status = occurrence.event.component.getFirstPropertyValue("status")
  if (status === "CANCELLED") return null

  return {
    summary: textProperty(occurrence.event, "summary"),
    start: formatTime(occurrence.start),
    end: formatTime(occurrence.end),
    allDay: occurrence.start.isDate,
    organizer: typeof organizer === "string" ? organizer.replace(/^mailto:/i, "") : null,
    room: parseRoom(link),
    recurring: occurrence.recurring,
  }
}

/**
 * Expands the calendar and keeps only occurrences that carry a Meet link,
 * resolving RECURRENCE-ID overrides and dropping EXDATE instances.
 */
export function parseMeetings(
  text: string,
  range: { from: Date; to: Date; limit: number; text?: string },
): Meeting[] {
  const root = parseCalendar(text)
  const masters: IcalEvent[] = []
  const exceptions: IcalEvent[] = []

  for (const component of root.getAllSubcomponents("vevent")) {
    const event = new ICAL.Event(component)
    if (component.hasProperty("recurrence-id")) exceptions.push(event)
    else masters.push(event)
  }

  // ical.js does not link overrides on its own; relateException makes
  // getOccurrenceDetails substitute the changed times and summaries.
  for (const exception of exceptions) masters.find((event) => event.uid === exception.uid)?.relateException(exception)

  const needle = range.text?.trim().toLowerCase()
  return masters
    .flatMap((event) => expand(event, range.from, range.to))
    .map(toMeeting)
    .filter((meeting): meeting is Meeting => meeting !== null)
    .filter((meeting) => !needle || meeting.summary.toLowerCase().includes(needle))
    .sort((left, right) => left.start.localeCompare(right.start))
    .slice(0, range.limit)
}

export async function meetInfo(config: MeetConfig): Promise<MeetInfo> {
  const { text, at } = await readSource(config)
  const root = parseCalendar(text)
  const name = root.getFirstPropertyValue("x-wr-calname")
  return {
    calendar: typeof name === "string" ? name : null,
    events: root.getAllSubcomponents("vevent").length,
    source: describeSource(config.source),
    fetchedAt: new Date(at).toISOString(),
    readOnly: true,
  }
}

export async function upcomingMeetings(config: MeetConfig, query: MeetingQuery): Promise<Meeting[]> {
  const now = new Date()
  const from = query.from ? new Date(query.from) : now
  const to = query.to ? new Date(query.to) : new Date(now.getTime() + week)

  if (Number.isNaN(from.getTime())) throw new Error(`Invalid from date "${query.from}". Use an ISO 8601 date or timestamp.`)
  if (Number.isNaN(to.getTime())) throw new Error(`Invalid to date "${query.to}". Use an ISO 8601 date or timestamp.`)
  if (from > to) throw new Error("The from date must not be after the to date.")

  const limit = Math.min(Math.max(Math.trunc(query.limit ?? 50), 1), 200)
  const { text } = await readSource(config)
  return parseMeetings(text, { from, to, limit, text: query.text })
}
