import { describe, expect, test } from "bun:test"
import ICAL from "ical.js"
import { findMeet, parseMeetings, parseRoom, upcomingMeetings } from "../src/meet.js"
import type { MeetConfig } from "../src/config.js"

const calendar = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Proton//Calendar//EN
X-WR-CALNAME:Work
BEGIN:VEVENT
UID:standup@proton.me
DTSTART:20260302T140000Z
DTEND:20260302T141500Z
RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=6
SUMMARY:Standup
CONFERENCE;VALUE=URI:https://meet.proton.me/guest?code=abc-defg-hij
END:VEVENT
BEGIN:VEVENT
UID:review@proton.me
DTSTART:20260311T130000Z
DTEND:20260311T133000Z
SUMMARY:Design review
DESCRIPTION:Join: https://meet.proton.me/rooms/wksp-42\\nNotes after
END:VEVENT
BEGIN:VEVENT
UID:coffee@proton.me
DTSTART:20260312T090000Z
DTEND:20260312T091500Z
SUMMARY:Coffee
END:VEVENT
BEGIN:VEVENT
UID:cancelled@proton.me
DTSTART:20260313T100000Z
DTEND:20260313T103000Z
SUMMARY:Retro
STATUS:CANCELLED
CONFERENCE;VALUE=URI:https://meet.proton.me/guest?code=retro
END:VEVENT
END:VCALENDAR
`

const config = { source: { kind: "file", path: "/tmp/unused.ics" }, cacheTtlMs: 60_000, timeoutMs: 5_000 } as MeetConfig

const march = {
  from: new Date("2026-03-01T00:00:00Z"),
  to: new Date("2026-03-31T23:59:59Z"),
  limit: 100,
}

describe("parseRoom", () => {
  test("reads the code from a guest link", () => {
    expect(parseRoom("https://meet.proton.me/guest?code=abc-defg-hij")).toEqual({
      url: "https://meet.proton.me/guest?code=abc-defg-hij",
      code: "abc-defg-hij",
      guest: true,
    })
  })

  test("falls back to the last path segment for room links", () => {
    expect(parseRoom("https://meet.proton.me/rooms/wksp-42")).toEqual({
      url: "https://meet.proton.me/rooms/wksp-42",
      code: "wksp-42",
      guest: false,
    })
  })

  test("tolerates links from other hosts without inventing a code", () => {
    expect(parseRoom("https://example.com/call")).toEqual({
      url: "https://example.com/call",
      code: null,
      guest: false,
    })
  })

  test("rejects values that are not URLs", () => {
    expect(() => parseRoom("not a link")).toThrow(/is not a URL/)
  })
})

describe("findMeet", () => {
  test("prefers the CONFERENCE property over the description", () => {
    const component = new ICAL.Component(ICAL.parse(calendar)).getAllSubcomponents("vevent")[0]!
    expect(findMeet(new ICAL.Event(component))).toBe("https://meet.proton.me/guest?code=abc-defg-hij")
  })

  test("falls back to a URL inside the description", () => {
    const component = new ICAL.Component(ICAL.parse(calendar)).getAllSubcomponents("vevent")[1]!
    expect(findMeet(new ICAL.Event(component))).toBe("https://meet.proton.me/rooms/wksp-42")
  })
})

describe("parseMeetings", () => {
  test("keeps only occurrences that carry a Meet room", () => {
    const meetings = parseMeetings(calendar, march)
    expect(meetings.map((meeting) => meeting.summary)).toEqual([
      "Standup",
      "Standup",
      "Design review",
      "Standup",
      "Standup",
      "Standup",
    ])
  })

  test("expands recurring meetings into dated occurrences", () => {
    const meetings = parseMeetings(calendar, march)
    expect(meetings[0]).toMatchObject({
      start: "2026-03-02T14:00:00.000Z",
      recurring: true,
      room: { code: "abc-defg-hij", guest: true },
    })
    expect(meetings.at(-1)).toMatchObject({
      start: "2026-03-30T14:00:00.000Z",
      recurring: true,
    })
  })

  test("drops cancelled meetings even when they carry a room", () => {
    expect(parseMeetings(calendar, march).map((meeting) => meeting.summary)).not.toContain("Retro")
  })

  test("filters by summary text", () => {
    expect(parseMeetings(calendar, { ...march, text: "review" }).map((meeting) => meeting.summary)).toEqual([
      "Design review",
    ])
  })
})

describe("upcomingMeetings", () => {
  test("rejects an inverted range", async () => {
    await expect(
      upcomingMeetings(config, { from: "2026-03-05", to: "2026-03-01" }),
    ).rejects.toThrow(/must not be after/)
  })

  test("rejects an invalid date", async () => {
    await expect(upcomingMeetings(config, { from: "tomorrow" })).rejects.toThrow(/Invalid from date/)
  })
})
