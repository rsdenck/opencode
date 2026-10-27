#!/usr/bin/env node
/**
 * End-to-end smoke test for a running OpenCode Cowork instance.
 *
 * Usage:
 *   COWORK_AUTH_TOKEN=... node scripts/smoke.mjs
 *   COWORK_SMOKE_TASK=0 node scripts/smoke.mjs   # skip the real agent task
 *
 * By default the script also asks the real OpenCode agent to create a file.
 * That requires a reachable OpenCode service and provider access. Set
 * COWORK_SMOKE_TASK=0 for an API/security-only smoke test.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"

const baseUrl = (process.env.COWORK_SMOKE_URL ?? "http://127.0.0.1:4319").replace(/\/$/, "")
const runTask = process.env.COWORK_SMOKE_TASK !== "0"
const model = process.env.COWORK_SMOKE_MODEL ?? "opencode/big-pickle"
const [providerID, ...rest] = model.split("/")
const modelID = rest.join("/") || "big-pickle"
const timeoutMs = Number(process.env.COWORK_SMOKE_TIMEOUT_MS ?? 180_000)

function resolveToken() {
  if (process.env.COWORK_AUTH_TOKEN) return process.env.COWORK_AUTH_TOKEN.trim()
  const candidates = [
    process.env.COWORK_DATA_DIR ? join(process.env.COWORK_DATA_DIR, "auth-token") : null,
    join(homedir(), ".local", "share", "cowork", "auth-token"),
  ].filter(Boolean)
  for (const candidate of candidates) {
    try {
      return readFileSync(candidate, "utf8").trim()
    } catch {
      // Try the next location.
    }
  }
  throw new Error(
    "No API token found. Set COWORK_AUTH_TOKEN or COWORK_DATA_DIR, or start the server once to generate one.",
  )
}

const token = resolveToken()
let failures = 0
let checks = 0

function check(name, condition, detail = "") {
  checks += 1
  if (condition) {
    console.log(`  ok   ${name}`)
    return
  }
  failures += 1
  console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`)
}

function section(name) {
  console.log(`\n${name}`)
}

async function request(path, options = {}) {
  const headers = { ...(options.headers ?? {}) }
  if (options.auth !== false) headers["x-cowork-token"] = token
  if (options.body !== undefined) headers["content-type"] = "application/json"
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
  const text = await response.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    json = undefined
  }
  return { status: response.status, headers: response.headers, text, json }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitFor(label, fn, predicate, timeout = timeoutMs) {
  const startedAt = Date.now()
  let last
  while (Date.now() - startedAt < timeout) {
    last = await fn()
    if (predicate(last)) return last
    await sleep(750)
  }
  throw new Error(`${label} timed out after ${timeout}ms (last value: ${JSON.stringify(last)})`)
}

async function main() {
  console.log(`OpenCode Cowork smoke test against ${baseUrl}`)

  section("Authentication and security headers")
  const unauthorized = await request("/api/health", { auth: false })
  check(
    "unauthenticated request is rejected",
    unauthorized.status === 401,
    `status ${unauthorized.status}`,
  )

  const health = await request("/api/health")
  check("authenticated health check succeeds", health.status === 200, `status ${health.status}`)
  check("database is ready", health.json?.database?.ok === true)
  check("OpenCode reports a connection", health.json?.opencode?.connected === true)
  check("security headers are present", health.headers.get("x-frame-options") === "DENY")
  check(
    "CSP is present",
    (health.headers.get("content-security-policy") ?? "").includes("default-src 'self'"),
  )

  const shellToken = token
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
  const shell = await request("/", { auth: false })
  check(
    "web shell is served",
    shell.status === 200 && shell.headers.get("content-type")?.includes("text/html"),
  )
  check(
    "web shell contains the API token",
    shell.text.includes('name="cowork-token"') && shell.text.includes(shellToken),
  )

  const badOrigin = await request("/api/system", {
    headers: { origin: "https://evil.example" },
  })
  check("foreign Origin is denied", badOrigin.status === 403, `status ${badOrigin.status}`)

  section("System information and catalog")
  const system = await request("/api/system")
  check("system endpoint responds", system.status === 200)
  check("version is reported", typeof system.json?.version === "string")

  const catalog = await request("/api/catalog")
  check("catalog endpoint responds", catalog.status === 200)
  check("at least one provider is exposed", (catalog.json?.providers?.length ?? 0) > 0)
  check("at least one agent is exposed", (catalog.json?.agents?.length ?? 0) > 0)

  section("Workspace and file isolation")
  const workspaceDir = mkdtempSync(join(tmpdir(), "cowork-smoke-"))
  mkdirSync(join(workspaceDir, "src"))
  writeFileSync(join(workspaceDir, "hello.txt"), "hello smoke")
  writeFileSync(join(workspaceDir, "src", "index.ts"), "export const ok = true\n")

  const workspaceResponse = await request("/api/workspaces", {
    method: "POST",
    body: { path: workspaceDir, name: "Smoke workspace" },
  })
  check("workspace can be registered", workspaceResponse.status === 201, workspaceResponse.text)
  const workspaceID = workspaceResponse.json?.workspace?.id
  check("workspace ID is returned", typeof workspaceID === "string")

  const listing = await request(`/api/workspaces/${workspaceID}/files`)
  check("directory listing works", listing.status === 200 && listing.json?.entries?.length === 2)

  const preview = await request(`/api/workspaces/${workspaceID}/file?path=hello.txt`)
  check("file preview works", preview.status === 200 && preview.json?.content === "hello smoke")

  const traversal = await request(`/api/workspaces/${workspaceID}/file?path=../../etc/passwd`)
  check(
    "path traversal is blocked",
    traversal.status === 403 && traversal.json?.error?.code === "path_traversal",
  )

  const absolute = await request(`/api/workspaces/${workspaceID}/file?path=/etc/passwd`)
  check(
    "absolute escape is blocked",
    absolute.status === 403 && absolute.json?.error?.code === "path_traversal",
  )

  const missing = await request("/api/tasks/tsk_does_not_exist")
  check(
    "unknown task returns a typed 404",
    missing.status === 404 && missing.json?.error?.code === "task_not_found",
  )

  let taskCreated = false
  let createdTaskID
  try {
    if (runTask) {
      section("Real task execution through OpenCode")
      const created = await request("/api/tasks", {
        method: "POST",
        body: {
          workspaceID,
          title: "Smoke test task",
          prompt: [
            "Create a file named smoke-proof.txt in the workspace root.",
            "Its exact contents must be: cowork-smoke-ok",
            "Then read the file back and report its contents.",
            "Do not modify any other file.",
          ].join(" "),
          model: { providerID: providerID ?? "opencode", id: modelID },
          approvalMode: "auto",
          agent: "build",
        },
      })
      check("task is accepted", created.status === 202, created.text)
      createdTaskID = created.json?.task?.id
      if (!createdTaskID) throw new Error("Task creation did not return an ID")
      taskCreated = true

      const detail = await waitFor(
        "task completion",
        () => request(`/api/tasks/${createdTaskID}`),
        (response) => {
          const status = response.json?.task?.status
          if (status === "failed" || status === "cancelled") {
            throw new Error(`Task ended as ${status}: ${response.json?.task?.error ?? "no error"}`)
          }
          return status === "completed"
        },
      )

      check("task completed", detail.json?.task?.status === "completed")
      check("task produced an assistant report", (detail.json?.task?.summary?.length ?? 0) > 0)
      check(
        "artifact is recorded",
        (detail.json?.artifacts ?? []).some((artifact) => artifact.path === "smoke-proof.txt"),
      )
      check(
        "execution success event is recorded",
        (detail.json?.events ?? []).some((event) => event.type === "session.execution.succeeded"),
      )

      const proofPath = join(workspaceDir, "smoke-proof.txt")
      let proof = ""
      try {
        proof = readFileSync(proofPath, "utf8").trim()
      } catch {
        proof = "<missing>"
      }
      check("generated file has the requested content", proof === "cowork-smoke-ok", proof)

      const persisted = await request("/api/tasks")
      check(
        "task is present in the persisted history",
        (persisted.json?.tasks ?? []).some((task) => task.id === createdTaskID),
      )
    } else {
      console.log("\nSkipping real task execution (COWORK_SMOKE_TASK=0).")
    }
  } finally {
    if (!taskCreated) {
      await request(`/api/workspaces/${workspaceID}`, { method: "DELETE" }).catch(() => {})
      rmSync(workspaceDir, { recursive: true, force: true })
    }
  }

  console.log(`\n${checks - failures}/${checks} checks passed.`)
  if (taskCreated) {
    console.log(`Task history and workspace retained at ${workspaceDir} (task ${createdTaskID}).`)
  }
  if (failures > 0) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(`\nSmoke test aborted: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
