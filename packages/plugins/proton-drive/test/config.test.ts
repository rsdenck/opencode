import { expect, test } from "bun:test"
import { driveConfig, parseJson } from "../src/config.js"

test("defaults to the CLI on PATH", () => {
  expect(driveConfig({})).toEqual({
    binary: "proton-drive",
    timeoutMs: 120_000,
    fileConflictStrategy: "rename",
    folderConflictStrategy: "rename",
    skipThumbnails: true,
  })
})

test("reads the binary, timeout, and conflict overrides", () => {
  expect(
    driveConfig({
      binary: "/usr/local/bin/proton-drive",
      timeoutMs: 5_000,
      fileConflictStrategy: "skip",
      folderConflictStrategy: "merge",
      skipThumbnails: false,
    }),
  ).toEqual({
    binary: "/usr/local/bin/proton-drive",
    timeoutMs: 5_000,
    fileConflictStrategy: "skip",
    folderConflictStrategy: "merge",
    skipThumbnails: false,
  })
})

test("invalid timeouts fall back to the default", () => {
  expect(driveConfig({ timeoutMs: -1 }).timeoutMs).toBe(120_000)
})

test("parses JSON output", () => {
  expect(parseJson('{"entries":[]}')).toEqual({ entries: [] })
  expect(parseJson("[1,2]")).toEqual([1, 2])
})

test("returns undefined for human-readable output", () => {
  expect(parseJson("Uploaded report.pdf")).toBeUndefined()
  expect(parseJson("   ")).toBeUndefined()
  expect(parseJson("{not json")).toBeUndefined()
})
