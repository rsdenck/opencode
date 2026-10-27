import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { EMPTY_USAGE } from "@cowork/core"
import type {
  AdapterEvent,
  AgentSummary,
  AssistantMessageSummary,
  CreateSessionInput,
  OpenCodeAdapter,
  ProviderSummary,
  SessionSummary,
} from "@cowork/opencode-adapter"
import { afterEach, describe, expect, it } from "vitest"
import { type AppContext, buildApp } from "../src/app.js"
import type { ServerConfig } from "../src/config.js"

class FakeAdapter {
  readonly createdSessions: CreateSessionInput[] = []
  readonly prompts: Array<{ sessionID: string; text: string }> = []
  readonly interrupted: string[] = []
  readonly replies: Array<{ sessionID: string; requestID: string; decision: string }> = []
  diffEntries: Array<{ file: string; status: "added" | "modified" | "deleted" }> = []
  messages: AssistantMessageSummary[] = [
    { text: "API final report", reasoning: "", finish: "stop", toolCalls: [] },
  ]
  providers: ProviderSummary[] = [
    {
      id: "opencode",
      name: "OpenCode",
      models: [
        {
          providerID: "opencode",
          id: "big-pickle",
          name: "Big Pickle",
          contextLimit: 1000,
          outputLimit: 1000,
          status: "active",
          variants: [],
          capabilities: {},
        },
      ],
    },
  ]
  agents: AgentSummary[] = [
    { id: "build", name: "Build", description: null, mode: "primary", hidden: false },
  ]

  private handler: ((event: AdapterEvent) => void | Promise<void>) | null = null

  async health() {
    return {
      connected: true,
      version: "2.1.4",
      pid: 42,
      url: "http://127.0.0.1:4096",
      mode: "explicit" as const,
      error: null,
      checkedAt: Date.now(),
    }
  }

  async subscribe(
    onEvent: (event: AdapterEvent) => void | Promise<void>,
    options: { signal: AbortSignal },
  ): Promise<void> {
    this.handler = onEvent
    await new Promise<void>((resolve) => {
      if (options.signal.aborted) return resolve()
      options.signal.addEventListener("abort", () => resolve(), { once: true })
    })
  }

  async emit(type: string, data: Record<string, unknown>): Promise<void> {
    if (!this.handler) throw new Error("No event handler registered")
    await this.handler({ type, data, raw: null, receivedAt: Date.now() })
  }

  sessionID(event: AdapterEvent): string | undefined {
    return typeof event.data.sessionID === "string" ? event.data.sessionID : undefined
  }

  async listAgents(): Promise<AgentSummary[]> {
    return this.agents
  }

  async listProviders(): Promise<ProviderSummary[]> {
    return this.providers
  }

  async listSkills() {
    return []
  }

  async listMcp() {
    return [{ name: "local", status: "connected" }]
  }

  async createSession(input: CreateSessionInput) {
    this.createdSessions.push(input)
    return {
      id: `ses_${this.createdSessions.length}`,
      projectID: "prj_test",
      directory: input.directory,
      title: input.title,
    } as never
  }

  async prompt(sessionID: string, text: string): Promise<void> {
    this.prompts.push({ sessionID, text })
  }

  async interrupt(sessionID: string): Promise<void> {
    this.interrupted.push(sessionID)
  }

  async replyPermission(sessionID: string, requestID: string, decision: string): Promise<void> {
    this.replies.push({ sessionID, requestID, decision })
  }

  async getSession(sessionID: string): Promise<SessionSummary> {
    return {
      id: sessionID,
      projectID: "prj_test",
      outcome: "success",
      cost: 0.01,
      tokens: { ...EMPTY_USAGE, input: 10, output: 5 },
    }
  }

  async getMessages(): Promise<AssistantMessageSummary[]> {
    return this.messages
  }

  async getDiff() {
    return this.diffEntries
  }

  async diagnostics() {
    return { node: process.version, opencode: "2.1.4" }
  }
}

interface TestServer {
  ctx: AppContext
  adapter: FakeAdapter
  token: string
  dir: string
  workspace: string
}

const servers: TestServer[] = []
// Contains characters that must be HTML-escaped when injected into the app shell.
const TOKEN = `test-token-<&">-abcdefghijklmnopqrstuvwxyz`

async function startServer(): Promise<TestServer> {
  const dir = mkdtempSync(join(tmpdir(), "cowork-server-"))
  const webDir = join(dir, "web")
  mkdirSync(webDir)
  writeFileSync(
    join(webDir, "index.html"),
    '<!doctype html><html><head><title>Cowork</title></head><body><div id="root"></div></body></html>',
  )
  const workspace = join(dir, "workspace")
  mkdirSync(workspace)
  writeFileSync(join(workspace, "notes.txt"), "hello from the workspace")
  mkdirSync(join(workspace, "src"))
  writeFileSync(join(workspace, "src", "app.ts"), "export const value = 1\n")

  const config: ServerConfig = {
    host: "127.0.0.1",
    port: 4319,
    dataDir: dir,
    databaseFile: join(dir, "cowork.db"),
    webDir,
    authToken: TOKEN,
    allowedOrigins: ["http://127.0.0.1:4319", "http://localhost:5173"],
    allowedWorkspaceRoots: [],
    maxPromptChars: 20_000,
    maxFiles: 1000,
    bodyLimit: 1_048_576,
    opencodeService: false,
    production: false,
  }

  const adapter = new FakeAdapter()
  const ctx = await buildApp({
    config,
    adapter: adapter as unknown as OpenCodeAdapter,
    logger: false,
  })
  const server = { ctx, adapter, token: TOKEN, dir, workspace }
  servers.push(server)
  return server
}

function auth(token: string): Record<string, string> {
  return { "x-cowork-token": token }
}

async function waitFor<T>(fn: () => Promise<T>, timeout = 5000): Promise<Exclude<T, null>> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeout) {
    const value = await fn()
    if (value !== null && value !== undefined) return value as Exclude<T, null>
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error("Timed out waiting for condition")
}

validateTokenTest()

function validateTokenTest() {
  // Keep the shared token shape explicit for readers.
  if (TOKEN.length < 24) throw new Error("Test token must be at least 24 characters")
}

afterEach(async () => {
  for (const server of servers.splice(0)) {
    await server.ctx.app.close()
    rmSync(server.dir, { recursive: true, force: true })
  }
})

describe("authentication and request hardening", () => {
  it("rejects unauthenticated API requests but serves the app shell", async () => {
    const { ctx } = await startServer()

    const unauthorized = await ctx.app.inject({ method: "GET", url: "/api/health" })
    expect(unauthorized.statusCode).toBe(401)
    expect(unauthorized.json()).toEqual({
      error: { code: "unauthorized", message: "A valid Cowork API token is required" },
    })

    const wrong = await ctx.app.inject({
      method: "GET",
      url: "/api/health",
      headers: auth("wrong-token-wrong-token-wrong-token"),
    })
    expect(wrong.statusCode).toBe(401)

    const shell = await ctx.app.inject({ method: "GET", url: "/" })
    expect(shell.statusCode).toBe(200)
    expect(shell.headers["content-type"]).toContain("text/html")
    expect(shell.body).toContain(
      'content="test-token-&lt;&amp;&quot;&gt;-abcdefghijklmnopqrstuvwxyz"',
    )
    expect(shell.headers["x-frame-options"]).toBe("DENY")
    expect(shell.headers["x-content-type-options"]).toBe("nosniff")
  })

  it("accepts x-cowork-token and Bearer credentials", async () => {
    const { ctx, token } = await startServer()
    const direct = await ctx.app.inject({ method: "GET", url: "/api/health", headers: auth(token) })
    expect(direct.statusCode).toBe(200)
    expect(direct.json().status).toBe("ok")
    expect(direct.json().opencode.connected).toBe(true)

    const bearer = await ctx.app.inject({
      method: "GET",
      url: "/api/system",
      headers: { authorization: `Bearer ${token}` },
    })
    expect(bearer.statusCode).toBe(200)
    expect(bearer.json().version).toBeTypeOf("string")
  })

  it("denies disallowed origins even with a valid token", async () => {
    const { ctx, token } = await startServer()
    const denied = await ctx.app.inject({
      method: "GET",
      url: "/api/health",
      headers: { ...auth(token), origin: "https://evil.example" },
    })
    expect(denied.statusCode).toBe(403)
    expect(denied.json().error.code).toBe("origin_not_allowed")

    const allowed = await ctx.app.inject({
      method: "GET",
      url: "/api/health",
      headers: { ...auth(token), origin: "http://127.0.0.1:4319" },
    })
    expect(allowed.statusCode).toBe(200)
  })

  it("returns JSON for unknown API routes and an app shell for unknown pages", async () => {
    const { ctx, token } = await startServer()
    const api = await ctx.app.inject({ method: "GET", url: "/api/nope", headers: auth(token) })
    expect(api.statusCode).toBe(404)
    expect(api.json().error.code).toBe("not_found")

    const page = await ctx.app.inject({ method: "GET", url: "/tasks/anything" })
    expect(page.statusCode).toBe(200)
    expect(page.headers["content-type"]).toContain("text/html")

    const malformed = await ctx.app.inject({
      method: "POST",
      url: "/api/workspaces",
      headers: { ...auth(token), "content-type": "application/json" },
      payload: "{not json",
    })
    expect(malformed.statusCode).toBe(400)
    expect(malformed.json().error.code).toBe("internal_error")
  })
})

describe("workspaces and files", () => {
  it("registers, lists and removes workspaces", async () => {
    const { ctx, token, workspace } = await startServer()
    const created = await ctx.app.inject({
      method: "POST",
      url: "/api/workspaces",
      headers: auth(token),
      payload: { path: workspace, name: "Demo" },
    })
    expect(created.statusCode).toBe(201)
    const workspaceID = created.json().workspace.id as string
    expect(created.json().workspace.path).toBe(workspace)

    const duplicate = await ctx.app.inject({
      method: "POST",
      url: "/api/workspaces",
      headers: auth(token),
      payload: { path: workspace },
    })
    expect(duplicate.statusCode).toBe(409)
    expect(duplicate.json().error.code).toBe("workspace_exists")

    const listed = await ctx.app.inject({
      method: "GET",
      url: "/api/workspaces",
      headers: auth(token),
    })
    expect(listed.json().workspaces).toHaveLength(1)

    const removed = await ctx.app.inject({
      method: "DELETE",
      url: `/api/workspaces/${workspaceID}`,
      headers: auth(token),
    })
    expect(removed.statusCode).toBe(200)
    expect(removed.json()).toEqual({ ok: true })
  })

  it("lists directories and previews files with traversal protection", async () => {
    const { ctx, token, workspace } = await startServer()
    const created = await ctx.app.inject({
      method: "POST",
      url: "/api/workspaces",
      headers: auth(token),
      payload: { path: workspace },
    })
    const workspaceID = created.json().workspace.id as string

    const listing = await ctx.app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceID}/files`,
      headers: auth(token),
    })
    expect(listing.statusCode).toBe(200)
    expect(listing.json().entries.map((entry: { name: string }) => entry.name)).toEqual([
      "src",
      "notes.txt",
    ])

    const file = await ctx.app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceID}/file?path=src/app.ts`,
      headers: auth(token),
    })
    expect(file.statusCode).toBe(200)
    expect(file.json()).toMatchObject({ binary: false, content: "export const value = 1\n" })

    const traversal = await ctx.app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceID}/file?path=../../etc/passwd`,
      headers: auth(token),
    })
    expect(traversal.statusCode).toBe(403)
    expect(traversal.json().error.code).toBe("path_traversal")

    const absolute = await ctx.app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceID}/file?path=/etc/passwd`,
      headers: auth(token),
    })
    expect(absolute.statusCode).toBe(403)
    expect(absolute.json().error.code).toBe("path_traversal")
  })

  it("validates workspace payloads", async () => {
    const { ctx, token } = await startServer()
    const relative = await ctx.app.inject({
      method: "POST",
      url: "/api/workspaces",
      headers: auth(token),
      payload: { path: "relative" },
    })
    expect(relative.statusCode).toBe(400)
    expect(relative.json().error.code).toBe("workspace_path_not_absolute")

    const forbidden = await ctx.app.inject({
      method: "POST",
      url: "/api/workspaces",
      headers: auth(token),
      payload: { path: "/etc" },
    })
    expect(forbidden.statusCode).toBe(400)
    expect(forbidden.json().error.code).toBe("workspace_path_forbidden")
  })
})

describe("task API", () => {
  async function register(server: TestServer): Promise<string> {
    const response = await server.ctx.app.inject({
      method: "POST",
      url: "/api/workspaces",
      headers: auth(server.token),
      payload: { path: server.workspace, name: "Tasks" },
    })
    return response.json().workspace.id as string
  }

  it("runs a task through approval and completion", async () => {
    const server = await startServer()
    const { ctx, token, adapter, workspace } = server
    const workspaceID = await register(server)

    const created = await ctx.app.inject({
      method: "POST",
      url: "/api/tasks",
      headers: auth(token),
      payload: {
        workspaceID,
        prompt: "Write the result file",
        model: { providerID: "opencode", id: "big-pickle" },
      },
    })
    expect(created.statusCode).toBe(202)
    const taskID = created.json().task.id as string

    const running = await waitFor(async () => {
      const response = await ctx.app.inject({
        method: "GET",
        url: `/api/tasks/${taskID}`,
        headers: auth(token),
      })
      return response.json().task.status === "running" ? response.json().task : null
    })
    expect(running.sessionID).toBe("ses_1")

    const list = await ctx.app.inject({
      method: "GET",
      url: "/api/tasks",
      headers: auth(token),
    })
    expect(list.json().total).toBe(1)
    expect(list.json().tasks[0].id).toBe(taskID)

    writeFileSync(join(workspace, "result.txt"), "done")
    adapter.diffEntries = [{ file: "result.txt", status: "added" }]
    await adapter.emit("permission.asked", {
      id: "perm_api",
      sessionID: running.sessionID,
      action: "edit",
      resources: [join(workspace, "result.txt")],
      metadata: { diff: "+done" },
    })

    const awaiting = await waitFor(async () => {
      const response = await ctx.app.inject({
        method: "GET",
        url: `/api/tasks/${taskID}`,
        headers: auth(token),
      })
      return response.json().task.status === "awaiting_approval" ? response.json() : null
    })
    expect(awaiting.approvals).toHaveLength(1)
    expect(awaiting.approvals[0].status).toBe("pending")
    const approvalID = awaiting.approvals[0].id as string

    const reply = await ctx.app.inject({
      method: "POST",
      url: `/api/approvals/${approvalID}/reply`,
      headers: auth(token),
      payload: { decision: "once", message: "approved in test" },
    })
    expect(reply.statusCode).toBe(200)
    expect(reply.json().approval.status).toBe("approved")
    expect(adapter.replies).toEqual([
      { sessionID: "ses_1", requestID: "perm_api", decision: "once" },
    ])

    const secondReply = await ctx.app.inject({
      method: "POST",
      url: `/api/approvals/${approvalID}/reply`,
      headers: auth(token),
      payload: { decision: "reject" },
    })
    expect(secondReply.statusCode).toBe(409)

    await adapter.emit("session.execution.succeeded", { sessionID: running.sessionID })
    const completed = await waitFor(async () => {
      const response = await ctx.app.inject({
        method: "GET",
        url: `/api/tasks/${taskID}`,
        headers: auth(token),
      })
      return response.json().task.status === "completed" ? response.json() : null
    })
    expect(completed.task.summary).toBe("API final report")
    expect(completed.artifacts).toHaveLength(1)
    expect(completed.artifacts[0]).toMatchObject({ path: "result.txt", change: "created" })
    expect(
      completed.events.some((event: { type: string }) => event.type === "task.completed"),
    ).toBe(true)

    const artifacts = await ctx.app.inject({
      method: "GET",
      url: `/api/tasks/${taskID}/artifacts`,
      headers: auth(token),
    })
    expect(artifacts.json().artifacts).toHaveLength(1)

    const messages = await ctx.app.inject({
      method: "GET",
      url: `/api/tasks/${taskID}/messages`,
      headers: auth(token),
    })
    expect(messages.json().messages).toHaveLength(1)
  })

  it("cancels a running task and rejects invalid transitions", async () => {
    const server = await startServer()
    const { ctx, token, adapter } = server
    const workspaceID = await register(server)
    const created = await ctx.app.inject({
      method: "POST",
      url: "/api/tasks",
      headers: auth(token),
      payload: { workspaceID, prompt: "Cancel me" },
    })
    const taskID = created.json().task.id as string
    await waitFor(async () => {
      const response = await ctx.app.inject({
        method: "GET",
        url: `/api/tasks/${taskID}`,
        headers: auth(token),
      })
      return response.json().task.status === "running" ? response.json().task : null
    })

    const cancelled = await ctx.app.inject({
      method: "POST",
      url: `/api/tasks/${taskID}/cancel`,
      headers: auth(token),
    })
    expect(cancelled.statusCode).toBe(200)
    expect(cancelled.json().task.status).toBe("cancelled")
    expect(adapter.interrupted).toEqual(["ses_1"])

    const again = await ctx.app.inject({
      method: "POST",
      url: `/api/tasks/${taskID}/cancel`,
      headers: auth(token),
    })
    expect(again.statusCode).toBe(409)
    expect(again.json().error.code).toBe("task_already_finished")

    const resume = await ctx.app.inject({
      method: "POST",
      url: `/api/tasks/${taskID}/resume`,
      headers: auth(token),
    })
    expect(resume.statusCode).toBe(409)
    expect(resume.json().error.code).toBe("task_not_resumable")
  })

  it("validates task payloads and prompt limits", async () => {
    const server = await startServer()
    const { ctx, token } = server
    const workspaceID = await register(server)

    const missingPrompt = await ctx.app.inject({
      method: "POST",
      url: "/api/tasks",
      headers: auth(token),
      payload: { workspaceID },
    })
    expect(missingPrompt.statusCode).toBe(400)
    expect(missingPrompt.json().error.code).toBe("validation_error")

    const unknownWorkspace = await ctx.app.inject({
      method: "POST",
      url: "/api/tasks",
      headers: auth(token),
      payload: { workspaceID: "wsp_missing", prompt: "hello" },
    })
    expect(unknownWorkspace.statusCode).toBe(404)
    expect(unknownWorkspace.json().error.code).toBe("workspace_not_found")

    const unknownTask = await ctx.app.inject({
      method: "GET",
      url: "/api/tasks/tsk_missing",
      headers: auth(token),
    })
    expect(unknownTask.statusCode).toBe(404)
    expect(unknownTask.json().error.code).toBe("task_not_found")

    const settings = await ctx.app.inject({
      method: "PATCH",
      url: "/api/settings",
      headers: auth(token),
      payload: { defaultApprovalMode: "strict", defaultAgent: "build" },
    })
    expect(settings.statusCode).toBe(200)
    expect(settings.json().settings.defaultApprovalMode).toBe("strict")

    const invalidSettings = await ctx.app.inject({
      method: "PATCH",
      url: "/api/settings",
      headers: auth(token),
      payload: { taskRetentionDays: 0 },
    })
    expect(invalidSettings.statusCode).toBe(400)
  })

  it("exposes catalog and diagnostics through the adapter", async () => {
    const { ctx, token } = await startServer()
    const catalog = await ctx.app.inject({
      method: "GET",
      url: "/api/catalog",
      headers: auth(token),
    })
    expect(catalog.statusCode).toBe(200)
    expect(catalog.json().providers[0].id).toBe("opencode")
    expect(catalog.json().agents[0].id).toBe("build")
    expect(catalog.json().settings.defaultApprovalMode).toBe("ask")

    const diagnostics = await ctx.app.inject({
      method: "GET",
      url: "/api/system/diagnostics",
      headers: auth(token),
    })
    expect(diagnostics.statusCode).toBe(200)
    expect(diagnostics.json().node).toBe(process.version)
  })
})
