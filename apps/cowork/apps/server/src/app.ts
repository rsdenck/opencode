import { timingSafeEqual } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import {
  CoworkError,
  CreateTaskInputSchema,
  CreateWorkspaceInputSchema,
  ListTasksQuerySchema,
  ReplyApprovalInputSchema,
  toPublicError,
  UpdateSettingsInputSchema,
} from "@cowork/core"
import { OpenCodeAdapter } from "@cowork/opencode-adapter"
import { Database, Store } from "@cowork/storage"
import { type EngineLogger, TaskEngine, type TaskUpdate } from "@cowork/task-engine"
import { listDirectory, readTextFile } from "@cowork/workspace"
import fastifyStatic from "@fastify/static"
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify"
import { ZodError, type ZodType } from "zod"
import { assertSecureBinding, COWORK_VERSION, type ServerConfig } from "./config.js"

export interface BuildAppOptions {
  config: ServerConfig
  adapter?: OpenCodeAdapter
  store?: Store
  logger?: boolean | EngineLogger
}

export interface AppContext {
  app: FastifyInstance
  config: ServerConfig
  store: Store
  adapter: OpenCodeAdapter
  engine: TaskEngine
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

function bearerToken(request: FastifyRequest): string | null {
  const direct = request.headers["x-cowork-token"]
  if (typeof direct === "string" && direct.length > 0) return direct
  const authorization = request.headers.authorization
  if (authorization?.startsWith("Bearer ")) return authorization.slice(7)
  return null
}

function parse<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input)
  if (!result.success) {
    throw new ZodError(result.error.issues)
  }
  return result.data
}

function adaptLogger(fastify: FastifyInstance): EngineLogger {
  return {
    info: (message, details) => fastify.log.info({ ...details, scope: "engine" }, message),
    warn: (message, details) => fastify.log.warn({ ...details, scope: "engine" }, message),
    error: (message, details) => fastify.log.error({ ...details, scope: "engine" }, message),
    debug: (message, details) => fastify.log.debug({ ...details, scope: "engine" }, message),
  }
}

export async function buildApp(options: BuildAppOptions): Promise<AppContext> {
  const { config } = options
  assertSecureBinding(config)

  const store = options.store ?? new Store(new Database(config.databaseFile))
  const adapter =
    options.adapter ??
    new OpenCodeAdapter({
      ...(config.opencodeUrl ? { url: config.opencodeUrl } : {}),
      ...(config.opencodeToken ? { token: config.opencodeToken } : {}),
      service: config.opencodeService,
    })

  const app = Fastify({
    logger: options.logger === false ? false : { level: process.env.COWORK_LOG_LEVEL ?? "info" },
    bodyLimit: config.bodyLimit,
    trustProxy: process.env.COWORK_TRUST_PROXY === "1",
  })

  const engine = new TaskEngine({
    store,
    adapter,
    logger: options.logger === false ? undefined : adaptLogger(app),
    allowedWorkspaceRoots: config.allowedWorkspaceRoots,
    maxSnapshotFiles: config.maxFiles,
  })

  const startedAt = Date.now()

  app.addHook("onRequest", async (request, reply) => {
    reply.header("X-Content-Type-Options", "nosniff")
    reply.header("Referrer-Policy", "no-referrer")
    reply.header("X-Frame-Options", "DENY")
    reply.header(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    )

    if (!request.url.startsWith("/api/")) return

    const origin = request.headers.origin
    if (origin && !config.allowedOrigins.includes(origin)) {
      return reply.code(403).send({
        error: { code: "origin_not_allowed", message: "Request origin is not allowed" },
      })
    }

    const token = bearerToken(request)
    if (!token || !safeEqual(token, config.authToken)) {
      return reply.code(401).send({
        error: { code: "unauthorized", message: "A valid Cowork API token is required" },
      })
    }
  })

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: {
          code: "validation_error",
          message: "Request validation failed",
          details: error.issues,
        },
      })
    }
    const publicError = toPublicError(error)
    const coworkStatus = (error as CoworkError).status
    const fastifyStatus = (error as { statusCode?: number }).statusCode
    const status =
      typeof coworkStatus === "number"
        ? coworkStatus
        : typeof fastifyStatus === "number" && fastifyStatus >= 400 && fastifyStatus < 600
          ? fastifyStatus
          : 500
    if (status >= 500) request.log.error({ err: error }, "request failed")
    return reply.code(status).send({ error: publicError })
  })

  app.get("/api/health", async () => {
    const health = await adapter.health(true)
    let databaseOk = true
    try {
      store.db.raw.prepare("SELECT 1").get()
    } catch {
      databaseOk = false
    }
    return {
      status: databaseOk ? "ok" : "degraded",
      version: COWORK_VERSION,
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
      database: { ok: databaseOk, schemaVersion: store.db.schemaVersion },
      opencode: health,
    }
  })

  app.get("/api/system", async () => {
    return {
      version: COWORK_VERSION,
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
      opencode: await adapter.health(true),
      settings: engine.getSettings(),
      counts: {
        tasks: store.tasks.list({ limit: 1, offset: 0 }).total,
        activeTasks: engine.activeTaskCount(),
        workspaces: store.workspaces.list().length,
      },
      database: { schemaVersion: store.db.schemaVersion, file: config.databaseFile },
      limits: {
        maxPromptChars: config.maxPromptChars,
        maxFiles: config.maxFiles,
        bodyLimit: config.bodyLimit,
      },
    }
  })

  app.get("/api/system/diagnostics", async () => {
    return adapter.diagnostics()
  })

  app.get("/api/catalog", async () => {
    const [providers, agents, skills, mcp] = await Promise.all([
      adapter.listProviders().catch(() => []),
      adapter.listAgents().catch(() => []),
      adapter.listSkills(),
      adapter.listMcp(),
    ])
    return { providers, agents, skills, mcp, settings: engine.getSettings() }
  })

  app.get("/api/workspaces", async () => {
    return { workspaces: engine.listWorkspaces() }
  })

  app.post("/api/workspaces", async (request, reply) => {
    const input = parse(CreateWorkspaceInputSchema, request.body)
    const workspace = await engine.addWorkspace(input)
    return reply.code(201).send({ workspace })
  })

  app.delete("/api/workspaces/:id", async (request) => {
    const { id } = request.params as { id: string }
    engine.removeWorkspace(id)
    return { ok: true }
  })

  app.get("/api/workspaces/:id/files", async (request) => {
    const { id } = request.params as { id: string }
    const query = request.query as Record<string, string | undefined>
    const workspace = engine.listWorkspaces().find((entry) => entry.id === id)
    if (!workspace) {
      throw new CoworkError("workspace_not_found", "Workspace not found", { status: 404 })
    }
    return listDirectory(workspace.path, query.path ?? "", {
      limit: Math.min(Number(query.limit ?? 1000) || 1000, 2000),
    })
  })

  app.get("/api/workspaces/:id/file", async (request) => {
    const { id } = request.params as { id: string }
    const query = request.query as Record<string, string | undefined>
    const workspace = engine.listWorkspaces().find((entry) => entry.id === id)
    if (!workspace) {
      throw new CoworkError("workspace_not_found", "Workspace not found", { status: 404 })
    }
    if (!query.path) {
      throw new CoworkError("path_required", "The path query parameter is required", {
        status: 400,
      })
    }
    return readTextFile(workspace.path, query.path)
  })

  app.get("/api/tasks", async (request) => {
    const query = parse(ListTasksQuerySchema, request.query)
    const result = engine.listTasks(query)
    return { tasks: result.items, total: result.total, limit: query.limit, offset: query.offset }
  })

  app.post("/api/tasks", async (request, reply) => {
    const input = parse(CreateTaskInputSchema, request.body)
    if (input.prompt.length > config.maxPromptChars) {
      return reply.code(400).send({
        error: {
          code: "prompt_too_long",
          message: `Prompt exceeds the configured limit of ${config.maxPromptChars} characters`,
        },
      })
    }
    const task = await engine.createTask(input)
    return reply.code(202).send({ task })
  })

  app.get("/api/tasks/:id", async (request) => {
    const { id } = request.params as { id: string }
    const query = request.query as Record<string, string | undefined>
    const eventLimit = Math.min(Math.max(Number(query.eventLimit ?? 500) || 500, 1), 2000)
    return engine.getTaskDetail(id, eventLimit)
  })

  app.get("/api/tasks/:id/events", async (request) => {
    const { id } = request.params as { id: string }
    const query = request.query as Record<string, string | undefined>
    const limit = Math.min(Math.max(Number(query.limit ?? 500) || 500, 1), 2000)
    return { events: store.events.list(id, limit) }
  })

  app.get("/api/tasks/:id/approvals", async (request) => {
    const { id } = request.params as { id: string }
    return { approvals: store.approvals.listByTask(id) }
  })

  app.get("/api/tasks/:id/messages", async (request) => {
    const { id } = request.params as { id: string }
    const task = store.tasks.get(id)
    if (!task) {
      throw new CoworkError("task_not_found", "Task not found", { status: 404 })
    }
    if (!task.sessionID) return { messages: [] }
    const messages = await adapter.getMessages(task.sessionID).catch(() => [])
    return { messages }
  })

  app.get("/api/tasks/:id/artifacts", async (request) => {
    const { id } = request.params as { id: string }
    const task = store.tasks.get(id)
    if (!task) {
      throw new CoworkError("task_not_found", "Task not found", { status: 404 })
    }
    return { artifacts: store.artifacts.listByTask(id) }
  })

  app.post("/api/tasks/:id/cancel", async (request) => {
    const { id } = request.params as { id: string }
    return { task: await engine.cancelTask(id) }
  })

  app.post("/api/tasks/:id/resume", async (request) => {
    const { id } = request.params as { id: string }
    return { task: await engine.resumeTask(id) }
  })

  app.post("/api/approvals/:id/reply", async (request) => {
    const { id } = request.params as { id: string }
    const input = parse(ReplyApprovalInputSchema, request.body)
    const approval = await engine.replyApproval(id, input.decision, input.message)
    return { approval }
  })

  app.get("/api/settings", async () => {
    return { settings: engine.getSettings() }
  })

  app.patch("/api/settings", async (request) => {
    const input = parse(UpdateSettingsInputSchema, request.body)
    return { settings: engine.updateSettings(input) }
  })

  app.get("/api/events", (request, reply: FastifyReply) => {
    const query = request.query as Record<string, string | undefined>
    const filterTaskID = query.taskID

    reply.hijack()
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    })
    reply.raw.write("retry: 3000\n\n")
    reply.raw.write(`event: ready\ndata: ${JSON.stringify({ at: Date.now() })}\n\n`)

    const write = (update: TaskUpdate) => {
      if (filterTaskID && update.taskID !== filterTaskID) return
      reply.raw.write(`event: update\ndata: ${JSON.stringify(update)}\n\n`)
    }
    const unsubscribe = engine.subscribe(write)
    const heartbeat = setInterval(() => {
      reply.raw.write(`event: heartbeat\ndata: ${Date.now()}\n\n`)
    }, 15_000)

    const cleanup = () => {
      clearInterval(heartbeat)
      unsubscribe()
    }
    request.raw.on("close", cleanup)
    request.raw.on("error", cleanup)
    reply.raw.on("close", cleanup)
  })

  // --- Web application -----------------------------------------------------
  const indexPath = join(config.webDir, "index.html")
  const renderIndex = (): string | null => {
    if (!existsSync(indexPath)) return null
    const html = readFileSync(indexPath, "utf8")
    const meta = `<meta name="cowork-token" content="${escapeHtmlAttribute(config.authToken)}" />`
    return html.includes("</head>") ? html.replace("</head>", `${meta}\n</head>`) : html
  }

  app.get("/", async (_request, reply) => {
    const html = renderIndex()
    if (!html) {
      return reply
        .code(503)
        .type("text/plain")
        .send("Cowork web interface not built. Run `npm run build`.")
    }
    return reply.type("text/html; charset=utf-8").send(html)
  })

  app.get("/index.html", async (_request, reply) => {
    const html = renderIndex()
    if (!html)
      return reply.code(404).send({ error: { code: "not_built", message: "Web UI not built" } })
    return reply.type("text/html; charset=utf-8").send(html)
  })

  if (existsSync(config.webDir)) {
    await app.register(fastifyStatic, {
      root: config.webDir,
      prefix: "/",
      index: false,
      wildcard: true,
      cacheControl: true,
      maxAge: config.production ? "1h" : 0,
    })
  }

  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith("/api/")) {
      return reply.code(404).send({ error: { code: "not_found", message: "Route not found" } })
    }
    const html = renderIndex()
    if (!html) {
      return reply.code(404).send({ error: { code: "not_found", message: "Route not found" } })
    }
    return reply.type("text/html; charset=utf-8").send(html)
  })

  app.addHook("onClose", async () => {
    await engine.stop()
    store.close()
  })

  await engine.start()
  return { app, config, store, adapter, engine }
}
