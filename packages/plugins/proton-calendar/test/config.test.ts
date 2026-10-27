import { expect, test } from "bun:test"
import { calendarConfig, describeSource, normalizeShareUrl } from "../src/config.js"

test("reads a share link from options", () => {
  const config = calendarConfig({ url: "https://calendar.proton.me/api/calendar/v1/url/abc/calendar.ics" })
  expect(config.source).toEqual({ kind: "url", url: "https://calendar.proton.me/api/calendar/v1/url/abc/calendar.ics" })
  expect(config.cacheTtlMs).toBe(600_000)
})

test("accepts webcal links by switching them to https", () => {
  expect(normalizeShareUrl("webcal://calendar.proton.me/api/calendar/v1/url/abc/calendar.ics")).toBe(
    "https://calendar.proton.me/api/calendar/v1/url/abc/calendar.ics",
  )
})

test("rejects non-http schemes", () => {
  expect(() => normalizeShareUrl("file:///etc/passwd")).toThrow(/Unsupported calendar URL scheme/)
})

test("reads an exported file from options", () => {
  const config = calendarConfig({ path: "/home/me/calendar.ics", cacheTtlMs: 1_000 })
  expect(config.source).toEqual({ kind: "file", path: "/home/me/calendar.ics" })
  expect(config.cacheTtlMs).toBe(1_000)
})

test("a missing source explains how to get one", () => {
  expect(() => calendarConfig({})).toThrow(/Proton Calendar source is missing/)
})

test("share links are reported by host only", () => {
  expect(describeSource({ kind: "url", url: "https://calendar.proton.me/api/calendar/v1/url/secret/calendar.ics" })).toBe(
    "calendar.proton.me",
  )
  expect(describeSource({ kind: "file", path: "/home/me/calendar.ics" })).toBe("/home/me/calendar.ics")
})
