import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { documentInfo, listDocuments, normalizePath, parseNodes, readName } from "../src/catalog.js"
import { DOC_MEDIA_TYPE, type CatalogConfig } from "../src/config.js"

const listing = `[
 {"uid":"f1","name":{"ok":true,"value":"Notes"},"type":"file","mediaType":"application/vnd.proton.doc","creationTime":"2026-01-02T03:04:05.000Z","modificationTime":"2026-02-03T04:05:06.000Z","totalStorageSize":1234,"isShared":true},
 {"uid":"f2","name":{"ok":true,"value":"report.pdf"},"type":"file","mediaType":"application/pdf"},
 {"uid":"d1","name":{"ok":true,"value":"Archive"},"type":"folder","mediaType":"Folder"}
]`

const nested = `[
 {"uid":"f3","name":"Old notes","type":"file","mediaType":"application/vnd.proton.doc"},
 {"uid":"f4","name":{"ok":true,"value":"Budget"},"type":"file","mediaType":"application/vnd.proton.sheet"}
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
  /my-files/Archive)
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
  directory = await mkdtemp(join(tmpdir(), "proton-docs-"))
  const binary = join(directory, "proton-drive")
  await writeFile(binary, script, { mode: 0o755 })
  config = { binary, timeoutMs: 5_000, mediaType: DOC_MEDIA_TYPE, kind: "doc" }
})

afterAll(async () => {
  await rm(directory, { recursive: true, force: true })
})

describe("normalizePath", () => {
  test("adds a leading slash and collapses empty segments", () => {
    expect(normalizePath("my-files//Notes/")).toBe("/my-files/Notes")
    expect(normalizePath("/")).toBe("/")
    expect(normalizePath("  ")).toBe("/")
  })
})

describe("readName", () => {
  test("unwraps the SDK Result wrapper", () => {
    expect(readName({ ok: true, value: "Plan" })).toBe("Plan")
  })

  test("accepts a plain string from older builds", () => {
    expect(readName("Plan")).toBe("Plan")
  })

  test("reports an undecryptable name instead of dropping the node", () => {
    expect(readName({ ok: false, error: {} })).toBe("(undecryptable name)")
  })
})

describe("parseNodes", () => {
  test("rejects human-readable output", () => {
    expect(() => parseNodes("📄 Notes", "/my-files")).toThrow(/did not return JSON/)
  })
})

describe("listDocuments", () => {
  test("returns only documents from the starting folder at depth 1", async () => {
    const result = await listDocuments(config, {})
    expect(result.documents.map((entry) => entry.path)).toEqual(["/my-files/Notes"])
    expect(result.scannedFolders).toBe(1)
    expect(result.truncated).toBe(false)
  })

  test("keeps metadata from the CLI payload", async () => {
    const [notes] = (await listDocuments(config, {})).documents
    expect(notes).toMatchObject({
      name: "Notes",
      uid: "f1",
      modified: "2026-02-03T04:05:06.000Z",
      sizeBytes: 1234,
      shared: true,
    })
  })

  test("walks subfolders when depth is greater than one", async () => {
    const result = await listDocuments(config, { depth: 2 })
    expect(result.documents.map((entry) => entry.name)).toEqual(["Old notes", "Notes"])
    expect(result.scannedFolders).toBe(2)
  })

  test("excludes other node kinds, including Proton Sheets", async () => {
    const names = (await listDocuments(config, { depth: 2 })).documents.map((entry) => entry.name)
    expect(names).not.toContain("Budget")
    expect(names).not.toContain("report.pdf")
  })

  test("filters by text across name and path", async () => {
    const result = await listDocuments(config, { depth: 2, text: "archive/old" })
    expect(result.documents.map((entry) => entry.path)).toEqual(["/my-files/Archive/Old notes"])
  })

  test("reports truncation when the limit is reached", async () => {
    const result = await listDocuments(config, { depth: 2, limit: 1 })
    expect(result.documents).toHaveLength(1)
    expect(result.truncated).toBe(true)
  })
})

describe("documentInfo", () => {
  test("returns metadata plus the export formats Proton offers", async () => {
    const info = await documentInfo(config, "/my-files/Notes")
    expect(info.name).toBe("Notes")
    expect(info.kind).toBe("doc")
    expect(info.export.formats).toEqual(["docx", "html", "txt", "md", "pdf"])
    expect(info.export.howTo).toContain("File → Download")
  })

  test("matches names case-insensitively", async () => {
    expect((await documentInfo(config, "/my-files/notes")).name).toBe("Notes")
  })

  test("rejects a folder path", async () => {
    await expect(documentInfo(config, "/my-files/Archive")).rejects.toThrow(/is a folder/)
  })

  test("reports a missing document", async () => {
    await expect(documentInfo(config, "/my-files/Missing")).rejects.toThrow(/No Proton Docs document named "Missing"/)
  })

  test("requires a path", async () => {
    await expect(documentInfo(config, "/")).rejects.toThrow(/Pass the path of one Proton Docs document/)
  })
})
