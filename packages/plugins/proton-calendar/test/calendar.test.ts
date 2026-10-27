import { expect, test } from "bun:test"
import { parseEvents } from "../src/calendar.js"

const calendar = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Proton AG//Proton Calendar//EN
X-WR-CALNAME:Work
X-WR-TIMEZONE:Europe/Zurich
BEGIN:VEVENT
UID:single@proton.me
DTSTART:20260310T090000Z
DTEND:20260310T100000Z
SUMMARY:Standup
LOCATION:Room 1
ORGANIZER;CN=Ana:mailto:ana@proton.me
END:VEVENT
BEGIN:VEVENT
UID:weekly@proton.me
DTSTART:20260302T140000Z
DTEND:20260302T150000Z
RRULE:FREQ=WEEKLY;COUNT=4
EXDATE:20260316T140000Z
SUMMARY:Weekly review
END:VEVENT
BEGIN:VEVENT
UID:weekly@proton.me
RECURRENCE-ID:20260309T140000Z
DTSTART:20260309T160000Z
DTEND:20260309T170000Z
SUMMARY:Weekly review (moved)
END:VEVENT
BEGIN:VEVENT
UID:holiday@proton.me
DTSTART;VALUE=DATE:20260305
SUMMARY:Company holiday
END:VEVENT
BEGIN:VEVENT
UID:cancelled@proton.me
DTSTART:20260312T090000Z
DTEND:20260312T093000Z
STATUS:CANCELLED
SUMMARY:Retro
END:VEVENT
END:VCALENDAR
`

const march = { from: new Date("2026-03-01T00:00:00Z"), to: new Date("2026-03-31T23:59:59Z"), limit: 100 }

test("expands recurring events and drops EXDATE instances", () => {
  const events = parseEvents(calendar, march)
  expect(events.filter((event) => event.uid === "weekly@proton.me")).toHaveLength(3)
  expect(events.map((event) => event.start)).not.toContain("2026-03-16T14:00:00.000Z")
})

test("applies RECURRENCE-ID overrides", () => {
  const moved = parseEvents(calendar, march).find((event) => event.summary === "Weekly review (moved)")
  expect(moved?.start).toBe("2026-03-09T16:00:00.000Z")
  expect(moved?.recurrenceID).toBe("2026-03-09T14:00:00.000Z")
  expect(moved?.recurring).toBe(true)
})

test("returns occurrences ordered by start time", () => {
  expect(parseEvents(calendar, march).map((event) => event.start)).toEqual([
    "2026-03-02T14:00:00.000Z",
    "2026-03-05",
    "2026-03-09T16:00:00.000Z",
    "2026-03-10T09:00:00.000Z",
    "2026-03-23T14:00:00.000Z",
  ])
})

test("marks all-day events and keeps them date-only", () => {
  const holiday = parseEvents(calendar, march).find((event) => event.uid === "holiday@proton.me")
  // iCalendar expands a date-only start without DTEND into a single day, so the
  // end date is exclusive.
  expect(holiday).toMatchObject({ start: "2026-03-05", end: "2026-03-06", allDay: true })
})

test("skips cancelled instances", () => {
  expect(parseEvents(calendar, march).find((event) => event.uid === "cancelled@proton.me")).toBeUndefined()
})

test("excludes events outside the range", () => {
  const events = parseEvents(calendar, { from: new Date("2026-03-10T00:00:00Z"), to: new Date("2026-03-11T00:00:00Z"), limit: 100 })
  expect(events.map((event) => event.uid)).toEqual(["single@proton.me"])
})

test("filters by text across summary, location, and organizer", () => {
  const events = parseEvents(calendar, { ...march, text: "ana@proton.me" })
  expect(events.map((event) => event.uid)).toEqual(["single@proton.me"])
})

test("honors the limit after sorting", () => {
  expect(parseEvents(calendar, { ...march, limit: 2 }).map((event) => event.start)).toEqual([
    "2026-03-02T14:00:00.000Z",
    "2026-03-05",
  ])
})

test("rejects HTML responses with an actionable message", () => {
  expect(() => parseEvents("<!doctype html><html></html>", march)).toThrow(/HTML instead of iCalendar/)
})

test("rejects malformed calendars", () => {
  expect(() => parseEvents("not a calendar", march)).toThrow(/not valid iCalendar/)
})
