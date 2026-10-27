import type { CatalogConfig, CatalogKind } from "./config.js"

export interface CatalogEntry {
  name: string
  path: string
  mediaType: string
  uid: string | null
  created: string | null
  modified: string | null
  sizeBytes: number | null
  shared: boolean
}

export interface CatalogQuery {
  path?: string
  depth?: number
  limit?: number
  text?: string
}

export interface CatalogResult {
  root: string
  kind: CatalogKind
  documents: CatalogEntry[]
  scannedFolders: number
  scannedNodes: number
  truncated: boolean
  readOnly: true
  note: string
}

export interface DocumentInfo extends CatalogEntry {
  kind: CatalogKind
  export: {
    formats: readonly string[]
    howTo: string
  }
}

const DEFAULT_ROOT = "/my-files"
const DEFAULT_DEPTH = 1
const MAX_DEPTH = 5
const DEFAULT_LIMIT = 100
const MAX_LIMIT = 500
/** Guard against walking an enormous Drive tree on a single tool call. */
const NODE_BUDGET = 20_000

const exportFormats: Record<CatalogKind, readonly string[]> = {
  doc: ["docx", "html", "txt", "md", "pdf"],
  sheet: ["xlsx", "csv", "tsv", "ods"],
}

const exportHowTo: Record<CatalogKind, string> = {
  doc: "Proton Docs has no export API. Open the document in Proton Drive, use the ⋮ menu to open it in Docs, then File → Download to save it as .docx, .html, .txt, .md, or .pdf.",
  sheet: "Proton Sheets has no export API. Open the spreadsheet in Proton Drive, then File → Download to save it as .xlsx, .csv, .tsv, or .ods (beta).",
}

const label: Record<CatalogKind, string> = { doc: "Proton Docs", sheet: "Proton Sheets" }

function catalogNote(config: CatalogConfig) {
  return `${label[config.kind]} documents are end-to-end encrypted Drive nodes with no public API. The Proton Drive CLI lists them but refuses to download them, so this plugin reports metadata only and export happens in the Proton Drive web UI.`
}

/** Normalizes a remote Drive path: leading slash, no trailing slash, no empty segments. */
export function normalizePath(value: string) {
  const segments = value
    .trim()
    .split("/")
    .filter((segment) => segment.length > 0)
  return segments.length === 0 ? "/" : `/${segments.join("/")}`
}

function joinPath(parent: string, name: string) {
  return parent === "/" ? `/${name}` : `${parent}/${name}`
}

function dirname(value: string) {
  const path = normalizePath(value)
  if (path === "/") return "/"
  const index = path.lastIndexOf("/")
  return index <= 0 ? "/" : path.slice(0, index)
}

function basename(value: string) {
  const path = normalizePath(value)
  if (path === "/") return ""
  return path.slice(path.lastIndexOf("/") + 1)
}

/**
 * The CLI serializes the SDK's `Result<string, Error>` name wrapper, so a healthy
 * node arrives as `{"ok":true,"value":"Notes"}`. Older builds or degraded nodes
 * can produce a bare string or an undecryptable value instead.
 */
export function readName(value: unknown): string {
  if (typeof value === "string" && value.length > 0) return value
  if (value && typeof value === "object") {
    const result = value as { ok?: boolean; value?: unknown }
    if (result.ok !== false && typeof result.value === "string" && result.value.length > 0) return result.value
  }
  return "(undecryptable name)"
}

const readDate = (value: unknown) => (typeof value === "string" && value.length > 0 ? value : null)

const readUid = (value: unknown) => (typeof value === "string" && value.length > 0 ? value : null)

const readSize = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null)

interface RawNode {
  uid?: unknown
  name?: unknown
  type?: unknown
  mediaType?: unknown
  creationTime?: unknown
  modificationTime?: unknown
  totalStorageSize?: unknown
  isShared?: unknown
}

export function isFolder(node: RawNode) {
  return node.type === "folder"
}

/**
 * Converts one CLI node into a catalog entry. Folders are kept while walking but
 * filtered out of the result, so this returns null for anything that is not the
 * configured media type.
 */
export function toEntry(node: RawNode, parent: string, config: CatalogConfig): CatalogEntry | null {
  if (isFolder(node)) return null
  const mediaType = typeof node.mediaType === "string" ? node.mediaType : null
  if (mediaType !== config.mediaType) return null

  const name = readName(node.name)
  return {
    name,
    path: joinPath(parent, name),
    mediaType,
    uid: readUid(node.uid),
    created: readDate(node.creationTime),
    modified: readDate(node.modificationTime),
    sizeBytes: readSize(node.totalStorageSize),
    shared: node.isShared === true,
  }
}

async function resolveBinary(config: CatalogConfig) {
  const binary = config.binary.includes("/")
    ? (await Bun.file(config.binary).exists())
      ? config.binary
      : null
    : Bun.which(config.binary)

  if (!binary) {
    throw new Error(
      `Proton Drive CLI not found (${config.binary}). Download it from https://proton.me/drive/download, run "proton-drive auth login" once, then set the binary option or PROTON_DRIVE_BIN.`,
    )
  }
  return binary
}

async function runCli(config: CatalogConfig, args: string[], signal?: AbortSignal) {
  const binary = await resolveBinary(config)
  const timeout = AbortSignal.timeout(config.timeoutMs)
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout

  const proc = Bun.spawn([binary, ...args], { stdin: "ignore", stdout: "pipe", stderr: "pipe" })
  const kill = () => proc.kill()
  combined.addEventListener("abort", kill, { once: true })

  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  combined.removeEventListener("abort", kill)

  if (combined.aborted) throw new Error(`proton-drive ${args[0]} timed out after ${config.timeoutMs} ms.`)
  if (code !== 0) {
    throw new Error(`proton-drive ${args.join(" ")} failed with exit code ${code}: ${stderr.trim() || stdout.trim()}`)
  }
  return stdout
}

/**
 * `filesystem list --json` streams a JSON array of nodes. A truncated or
 * human-readable response means the installed CLI ignores `--json`.
 */
export function parseNodes(stdout: string, path: string): RawNode[] {
  const trimmed = stdout.trim()
  if (trimmed.length === 0) return []
  if (trimmed[0] !== "[") {
    throw new Error(
      `proton-drive filesystem list ${path} did not return JSON. Update the Proton Drive CLI to a build that supports --json output.`,
    )
  }
  const parsed: unknown = JSON.parse(trimmed)
  if (!Array.isArray(parsed)) throw new Error(`Unexpected JSON from proton-drive filesystem list ${path}.`)
  return parsed.filter((node): node is RawNode => node !== null && typeof node === "object")
}

interface FolderListing {
  entries: CatalogEntry[]
  folders: Array<{ name: string; path: string }>
  nodes: number
}

async function listFolder(config: CatalogConfig, path: string, signal?: AbortSignal): Promise<FolderListing> {
  const nodes = parseNodes(await runCli(config, ["filesystem", "list", path, "--json"], signal), path)
  const entries: CatalogEntry[] = []
  const folders: Array<{ name: string; path: string }> = []

  for (const node of nodes) {
    if (isFolder(node)) {
      const name = readName(node.name)
      folders.push({ name, path: joinPath(path, name) })
      continue
    }
    const entry = toEntry(node, path, config)
    if (entry) entries.push(entry)
  }

  return { entries, folders, nodes: nodes.length }
}

const matches = (entry: CatalogEntry, needle: string) =>
  `${entry.name} ${entry.path}`.toLowerCase().includes(needle)

/**
 * Walks the Drive tree breadth-first from `query.path`, collecting nodes whose
 * media type matches. Depth 1 inspects only the given folder.
 */
export async function listDocuments(
  config: CatalogConfig,
  query: CatalogQuery,
  signal?: AbortSignal,
): Promise<CatalogResult> {
  const root = normalizePath(query.path ?? DEFAULT_ROOT)
  const depth = Math.min(Math.max(Math.trunc(query.depth ?? DEFAULT_DEPTH), 1), MAX_DEPTH)
  const limit = Math.min(Math.max(Math.trunc(query.limit ?? DEFAULT_LIMIT), 1), MAX_LIMIT)
  const needle = query.text?.trim().toLowerCase()

  const documents: CatalogEntry[] = []
  let scannedFolders = 0
  let scannedNodes = 0
  let truncated = false

  const queue: Array<{ path: string; level: number }> = [{ path: root, level: 1 }]

  while (queue.length > 0) {
    const current = queue.shift()!
    signal?.throwIfAborted()

    const listing = await listFolder(config, current.path, signal)
    scannedFolders += 1
    scannedNodes += listing.nodes

    for (const entry of listing.entries) {
      if (documents.length >= limit) {
        truncated = true
        break
      }
      if (!needle || matches(entry, needle)) documents.push(entry)
    }
    if (truncated) break

    if (current.level < depth) {
      for (const folder of listing.folders) {
        if (scannedNodes > NODE_BUDGET) {
          truncated = true
          break
        }
        queue.push({ path: folder.path, level: current.level + 1 })
      }
    }
    if (scannedNodes > NODE_BUDGET) {
      truncated = true
      break
    }
  }

  documents.sort((left, right) => left.path.localeCompare(right.path))

  return {
    root,
    kind: config.kind,
    documents,
    scannedFolders,
    scannedNodes,
    truncated,
    readOnly: true,
    note: catalogNote(config),
  }
}

/**
 * Resolves a single document by its remote path. The CLI has no stat command,
 * so the parent folder is listed and the last path segment is matched by name.
 */
export async function documentInfo(
  config: CatalogConfig,
  path: string,
  signal?: AbortSignal,
): Promise<DocumentInfo> {
  const target = normalizePath(path)
  const name = basename(target)
  if (!name) throw new Error(`Pass the path of one ${label[config.kind]} document, for example /my-files/Notes.`)

  const parent = dirname(target)
  const listing = await listFolder(config, parent, signal)
  const folder = listing.folders.find((item) => item.name.toLowerCase() === name.toLowerCase())
  if (folder) {
    throw new Error(
      `${target} is a folder. Pass the path of one ${label[config.kind]} document, or use the list tool to browse the folder.`,
    )
  }

  const entry = listing.entries.find((item) => item.name.toLowerCase() === name.toLowerCase())
  if (!entry) {
    throw new Error(
      `No ${label[config.kind]} document named "${name}" in ${parent}. Use the list tool to see what the folder contains.`,
    )
  }

  return {
    ...entry,
    kind: config.kind,
    export: { formats: exportFormats[config.kind], howTo: exportHowTo[config.kind] },
  }
}
