import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { documentInfo, listDocuments, parseNodes, readName } from "../src/catalog.js"
import { SHEET_MEDIA_TYPE, type CatalogConfig } from "../src/config.js"

const listing = `[
 {"uid":"s1","name":{"ok":true,"value":"Budget"},"type":"file","mediaType":"application/vnd.proton.sheet","creationTime":"2026-03-02T03:04:05.000Z","modificationTime":"2026-03-09T04:05:06.000Z","totalStorageSize":987,"isShared":false},
 {"uid":"f2","name":{"ok":true,"value":"report.pdf"},"type":"file","mediaType":"application/pdf"},
 {"uid":"d1","name":{"ok":true,"value":"Finance"},"type":"folder","mediaType":"Folder"}
]`

const nested = `[
 {"uid":"s2","name":"Forecast 2027","type":"file","mediaType":"application/vnd.proton.sheet"},
 {"uid":"f3","name":{"ok":true,"value":"Plan"},"type":"file","mediaType":"application/vnd.proton.doc"}
]`

const script = `#!/bin/sh
if [ "$1" != "filesystem" ] || [ "$2" != "list" ]; then
  echo "unexpected command: $*" >&2
  exit 64
fi
case "$3" in
  /my-files)
    cat <<'JSON'
${listing}
JSON
    ;;
  /my-files/Finance)
    cat <<'JSON'
${nested}
JSON
    ;;
  *)
    echo "no such folder: $3" >&2
    exit 1
    ;;
esac
`

let directory: string
let config: CatalogConfig

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "proton-sheets-"))
  const binary = join(directory, "proton-drive")
  await writeFile(binary, script, { mode: 0o755 })
  config = { binary, timeoutMs: 5_000, mediaType: SHEET_MEDIA_TYPE, kind: "sheet" }
})

afterAll(async () => {
  await rm(directory, { recursive: true, force: true })
})

test("readName accepts a plain string from older builds", () => {
  expect(readName("Budget")).toBe("Budget")
})

test("parseNodes rejects human-readable output", () => {
  expect(() => parseNodes("🗂️ Finance", "/my-files")).toThrow(/did not return JSON/)
})

test("listDocuments returns only spreadsheets and keeps metadata", async () => {
  const result = await listDocuments(config, {})
  expect(result.documents).toHaveLength(1)
  expect(result.documents[0]).toMatchObject({
    name: "Budget",
    uid: "s1",
    modified: "2026-03-09T04:05:06.000Z",
    sizeBytes: 987,
    shared: false,
  })
})

test("walks subfolders and skips Proton Docs and regular files", async () => {
  const names = (await listDocuments(config, { depth: 2 })).documents.map((entry) => entry.name)
  expect(names).toEqual(["Budget", "Forecast 2027"])
})

test("filters by text across name and path", async () => {
  const result = await listDocuments(config, { depth: 2, text: "forecast" })
  expect(result.documents.map((entry) => entry.path)).toEqual(["/my-files/Finance/Forecast 2027"])
})

test("documentInfo lists the formats Proton Sheets exports", async () => {
  const info = await documentInfo(config, "/my-files/Budget")
  expect(info.kind).toBe("sheet")
  expect(info.export.formats).toEqual(["xlsx", "csv", "tsv", "ods"])
  expect(info.export.howTo).toContain("File → Download")
})

test("documentInfo rejects a folder and a missing spreadsheet", async () => {
  await expect(documentInfo(config, "/my-files/Finance")).rejects.toThrow(/is a folder/)
  await expect(documentInfo(config, "/my-files/Missing")).rejects.toThrow(
    /No Proton Sheets document named "Missing"/,
  )
})
