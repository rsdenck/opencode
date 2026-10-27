import { CoworkError, redactValue } from "@cowork/core"
import {
  type EventSubscribeOutput,
  OpenCode,
  type OpenCodeClient,
  type SessionInfo,
} from "@opencode/client"
import type { Service as ServiceApi } from "@opencode/client/service"
import {
  type AdapterConfig,
  type AdapterEvent,
  type AgentSummary,
  type AssistantMessageSummary,
  type CreateSessionInput,
  type McpSummary,
  type ModelSummary,
  type OpenCodeHealth,
  type PermissionRequestSummary,
  type ProviderSummary,
  permissionsForMode,
  type SessionSummary,
  type SkillSummary,
} from "./types.js"

interface Endpoint {
  url: string
  headers: Record<string, string>
  mode: OpenCodeHealth["mode"]
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve()
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer)
        resolve()
      },
      { once: true },
    )
  })
}

function sessionIDOf(event: AdapterEvent): string | undefined {
  const data = event.data
  if (typeof data.sessionID === "string") return data.sessionID
  if (event.type === "session.created" && typeof data.id === "string") return data.id
  return undefined
}

export class OpenCodeAdapter {
  private endpointPromise: Promise<Endpoint> | null = null
  private clientPromise: Promise<OpenCodeClient> | null = null
  private lastHealth: OpenCodeHealth | null = null

  constructor(private readonly config: AdapterConfig = {}) {}

  get mode(): OpenCodeHealth["mode"] {
    if (this.config.url) return "explicit"
    if (this.config.service === false) return "unknown"
    return "background-service"
  }

  private async resolveEndpoint(): Promise<Endpoint> {
    if (this.config.url) {
      const headers: Record<string, string> = {}
      if (this.config.token) headers.authorization = `Bearer ${this.config.token}`
      return {
        url: this.config.url.replace(/\/$/, ""),
        headers,
        mode: "explicit",
      }
    }

    try {
      const serviceModule = (await import("@opencode/client/service")) as {
        Service: typeof ServiceApi
      }
      const endpoint = await serviceModule.Service.ensure()
      return {
        url: endpoint.url,
        headers: serviceModule.Service.headers(endpoint) ?? {},
        mode: "background-service",
      }
    } catch (error) {
      throw new CoworkError(
        "opencode_unavailable",
        `Could not discover or start the OpenCode background service: ${
          error instanceof Error ? error.message : String(error)
        }`,
        { status: 503 },
      )
    }
  }

  async client(): Promise<OpenCodeClient> {
    if (!this.clientPromise) {
      this.clientPromise = (async () => {
        const endpoint = await this.endpoint()
        return OpenCode.make({ baseUrl: endpoint.url, headers: endpoint.headers })
      })()
      this.clientPromise.catch(() => {
        this.clientPromise = null
      })
    }
    return this.clientPromise
  }

  private async endpoint(): Promise<Endpoint> {
    if (!this.endpointPromise) {
      this.endpointPromise = this.resolveEndpoint()
      this.endpointPromise.catch(() => {
        this.endpointPromise = null
      })
    }
    return this.endpointPromise
  }

  async health(force = false): Promise<OpenCodeHealth> {
    if (!force && this.lastHealth && Date.now() - this.lastHealth.checkedAt < 10_000) {
      return this.lastHealth
    }
    try {
      const client = await this.client()
      const info = await client.server.info()
      const endpoint = await this.endpoint()
      this.lastHealth = {
        connected: true,
        version: info.version,
        pid: info.pid,
        url: endpoint.url,
        mode: endpoint.mode,
        error: null,
        checkedAt: Date.now(),
      }
    } catch (error) {
      this.lastHealth = {
        connected: false,
        version: null,
        pid: null,
        url: this.config.url ?? null,
        mode: this.mode,
        error: error instanceof Error ? error.message : String(error),
        checkedAt: Date.now(),
      }
    }
    return this.lastHealth
  }

  async subscribe(
    onEvent: (event: AdapterEvent) => void | Promise<void>,
    options: {
      signal: AbortSignal
      onError?: (error: unknown) => void
      onReconnect?: () => void
    },
  ): Promise<void> {
    let attempts = 0
    while (!options.signal.aborted) {
      try {
        const client = await this.client()
        for await (const event of client.event.subscribe({ signal: options.signal })) {
          attempts = 0
          const payload = event as EventSubscribeOutput & {
            type: string
            data?: Record<string, unknown>
          }
          await onEvent({
            type: payload.type,
            data: (payload.data ?? {}) as Record<string, unknown>,
            raw: event,
            receivedAt: Date.now(),
          })
        }
      } catch (error) {
        if (options.signal.aborted) return
        options.onError?.(error)
      }
      if (options.signal.aborted) return
      attempts += 1
      const backoff = Math.min(1000 * 2 ** Math.min(attempts, 4), 15_000)
      await delay(backoff, options.signal)
      options.onReconnect?.()
    }
  }

  async listAgents(): Promise<AgentSummary[]> {
    const client = await this.client()
    const result = await client.agent.list()
    const data = (result as { data?: unknown }).data
    const agents = Array.isArray(data) ? data : []
    return agents.map((agent) => {
      const item = agent as Record<string, unknown>
      return {
        id: String(item.id),
        name: String(item.name ?? item.id),
        description: item.description ? String(item.description) : null,
        mode: String(item.mode ?? "primary"),
        hidden: Boolean(item.hidden),
      }
    })
  }

  async listProviders(): Promise<ProviderSummary[]> {
    const client = await this.client()
    const [providerResult, modelResult] = await Promise.all([
      client.provider.list(),
      client.model.list(),
    ])
    const providers = (providerResult as { data?: unknown }).data
    const models = (modelResult as { data?: unknown }).data
    const providerRows = Array.isArray(providers) ? providers : []
    const modelRows = Array.isArray(models) ? models : []

    const byProvider = new Map<string, ModelSummary[]>()
    for (const raw of modelRows) {
      const model = raw as Record<string, unknown>
      const providerID = String(model.providerID ?? "")
      if (!providerID) continue
      if (model.enabled === false) continue
      const capabilities =
        model.capabilities && typeof model.capabilities === "object"
          ? (model.capabilities as Record<string, unknown>)
          : {}
      const limit =
        model.limit && typeof model.limit === "object"
          ? (model.limit as Record<string, unknown>)
          : {}
      const summary: ModelSummary = {
        providerID,
        id: String(model.modelID ?? model.id ?? ""),
        name: String(model.name ?? model.modelID ?? model.id ?? "unknown"),
        contextLimit: Number(limit.context ?? 0),
        outputLimit: Number(limit.output ?? 0),
        status: String(model.status ?? "active"),
        variants: Array.isArray(model.variants)
          ? model.variants.map((variant) =>
              typeof variant === "string"
                ? variant
                : String((variant as Record<string, unknown>).id ?? ""),
            )
          : [],
        capabilities,
      }
      if (!summary.id) continue
      const list = byProvider.get(providerID) ?? []
      list.push(summary)
      byProvider.set(providerID, list)
    }

    const result: ProviderSummary[] = []
    for (const raw of providerRows) {
      const provider = raw as Record<string, unknown>
      const id = String(provider.id ?? "")
      if (!id) continue
      const modelsForProvider = byProvider.get(id) ?? []
      result.push({
        id,
        name: String(provider.name ?? id),
        models: modelsForProvider.sort((a, b) => a.name.localeCompare(b.name)),
      })
      byProvider.delete(id)
    }
    // Models from providers that were not present in provider.list().
    for (const [id, modelsForProvider] of byProvider) {
      result.push({ id, name: id, models: modelsForProvider })
    }
    return result.sort((a, b) => a.name.localeCompare(b.name))
  }

  async listModels(): Promise<ModelSummary[]> {
    return (await this.listProviders()).flatMap((provider) => provider.models)
  }

  async listSkills(): Promise<SkillSummary[]> {
    try {
      const client = await this.client()
      const result = await client.skill.list()
      const data = (result as { data?: unknown }).data
      if (!Array.isArray(data)) return []
      return data.map((raw) => {
        const skill = raw as Record<string, unknown>
        return {
          id: String(skill.id),
          name: String(skill.name ?? skill.id),
          description: skill.description ? String(skill.description) : null,
          autoinvoke: Boolean(skill.autoinvoke),
        }
      })
    } catch {
      return []
    }
  }

  async listMcp(): Promise<McpSummary[]> {
    try {
      const client = await this.client()
      const result = await client.mcp.list()
      const data = (result as { data?: unknown }).data
      if (!Array.isArray(data)) return []
      return data.map((raw) => {
        const server = raw as Record<string, unknown>
        const status = server.status as Record<string, unknown> | undefined
        return {
          name: String(server.name ?? "unknown"),
          status: String(status?.status ?? "unknown"),
          ...(typeof status?.error === "string" ? { error: status.error } : {}),
        }
      })
    } catch {
      return []
    }
  }

  async createSession(input: CreateSessionInput): Promise<SessionInfo> {
    const client = await this.client()
    return client.session.create({
      location: { directory: input.directory },
      title: input.title.slice(0, 200),
      agent: input.agent,
      model: input.model
        ? {
            id: input.model.id,
            providerID: input.model.providerID,
            ...(input.model.variant ? { variant: input.model.variant } : {}),
          }
        : null,
      permissions: permissionsForMode(input.approvalMode),
      metadata: { cowork: true },
    })
  }

  async prompt(sessionID: string, text: string): Promise<void> {
    const client = await this.client()
    await client.session.prompt({ sessionID, text })
  }

  async interrupt(sessionID: string): Promise<void> {
    const client = await this.client()
    await client.session.interrupt({ sessionID })
  }

  async listPermissions(sessionID: string): Promise<PermissionRequestSummary[]> {
    const client = await this.client()
    const result = await client.permission.list({ sessionID })
    const data = (result as unknown as { data?: unknown }).data
    const rows = Array.isArray(data) ? data : Array.isArray(result) ? result : []
    return rows.map((raw) => {
      const request = raw as Record<string, unknown>
      return {
        id: String(request.id),
        sessionID: String(request.sessionID ?? sessionID),
        action: String(request.action ?? "unknown"),
        resources: Array.isArray(request.resources)
          ? request.resources.map((resource) => String(resource))
          : [],
        metadata: request.metadata,
      }
    })
  }

  async replyPermission(
    sessionID: string,
    requestID: string,
    decision: "once" | "always" | "reject",
    message?: string,
  ): Promise<void> {
    const client = await this.client()
    await client.permission.reply({
      sessionID,
      requestID,
      decision,
      ...(message ? { message } : {}),
    })
  }

  async getSession(sessionID: string): Promise<SessionSummary> {
    const client = await this.client()
    const session = await client.session.get({ sessionID })
    return {
      id: session.id,
      projectID: session.projectID,
      outcome: session.outcome ?? null,
      cost: Number(session.cost ?? 0),
      tokens: {
        input: Number(session.tokens?.input ?? 0),
        output: Number(session.tokens?.output ?? 0),
        reasoning: Number(session.tokens?.reasoning ?? 0),
        cacheRead: Number(session.tokens?.cache?.read ?? 0),
        cacheWrite: Number(session.tokens?.cache?.write ?? 0),
      },
    }
  }

  async getMessages(sessionID: string): Promise<AssistantMessageSummary[]> {
    const client = await this.client()
    const result = (await client.message.list({ sessionID })) as unknown as {
      data?: unknown
    }
    const data = Array.isArray(result.data) ? result.data : []
    const summaries: AssistantMessageSummary[] = []
    for (const raw of [...data].reverse()) {
      const message = raw as Record<string, unknown>
      if (message.type !== "assistant") continue
      const content = Array.isArray(message.content) ? message.content : []
      const texts: string[] = []
      const reasoning: string[] = []
      const toolCalls: AssistantMessageSummary["toolCalls"] = []
      for (const partRaw of content) {
        const part = partRaw as Record<string, unknown>
        if (part.type === "text" && typeof part.text === "string") texts.push(part.text)
        if (part.type === "reasoning" && typeof part.text === "string") reasoning.push(part.text)
        if (part.type === "tool") {
          const state = part.state as Record<string, unknown> | undefined
          toolCalls.push({
            id: String(part.id ?? ""),
            name: String(part.name ?? "tool"),
            status: typeof state?.status === "string" ? state.status : null,
            input: state?.input,
          })
        }
      }
      summaries.push({
        text: texts.join("\n\n").trim(),
        reasoning: reasoning.join("\n\n").trim(),
        finish: typeof message.finish === "string" ? message.finish : null,
        toolCalls,
      })
    }
    return summaries
  }

  async getDiff(sessionID: string): Promise<
    Array<{
      file: string
      status: "added" | "deleted" | "modified"
      additions: number
      deletions: number
    }>
  > {
    try {
      const client = await this.client()
      const diff = await client.session.diff({ sessionID })
      if (!Array.isArray(diff)) return []
      return diff.map((raw) => {
        const item = raw as Record<string, unknown>
        return {
          file: String(item.file ?? ""),
          status: (item.status === "added" || item.status === "deleted"
            ? item.status
            : "modified") as "added" | "deleted" | "modified",
          additions: Number(item.additions ?? 0),
          deletions: Number(item.deletions ?? 0),
        }
      })
    } catch {
      return []
    }
  }

  async diagnostics(): Promise<Record<string, unknown>> {
    const health = await this.health(true)
    if (!health.connected) {
      return { health, providers: [], agents: [], skills: [], mcp: [] }
    }
    const [providers, agents, skills, mcp] = await Promise.all([
      this.listProviders().catch(() => []),
      this.listAgents().catch(() => []),
      this.listSkills(),
      this.listMcp(),
    ])
    return redactValue({
      health,
      providers: providers.map((provider) => ({
        id: provider.id,
        name: provider.name,
        models: provider.models.length,
      })),
      agents: agents.map((agent) => ({
        id: agent.id,
        name: agent.name,
        mode: agent.mode,
        hidden: agent.hidden,
      })),
      skills,
      mcp,
    }) as Record<string, unknown>
  }

  sessionID(event: AdapterEvent): string | undefined {
    return sessionIDOf(event)
  }
}
