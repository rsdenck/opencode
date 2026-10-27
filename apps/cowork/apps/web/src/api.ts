import type {
  AgentSummary,
  Approval,
  Artifact,
  AssistantMessage,
  Catalog,
  Decision,
  Diagnostics,
  DirectoryListing,
  McpSummary,
  ModelRef,
  ProviderSummary,
  Settings,
  SkillSummary,
  SystemInfo,
  Task,
  TaskDetail,
  TaskEvent,
  TaskUpdate,
  Workspace,
} from "./types"

function readToken(): string {
  const meta = document.querySelector('meta[name="cowork-token"]')?.getAttribute("content")?.trim()
  if (meta) {
    localStorage.setItem("cowork-token", meta)
    return meta
  }
  return localStorage.getItem("cowork-token")?.trim() ?? ""
}

export const API_TOKEN = readToken()

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details: unknown

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.code = code
    this.details = details
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  headers.set("x-cowork-token", API_TOKEN)
  if (options.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json")
  }
  const response = await fetch(path, { ...options, headers })
  const contentType = response.headers.get("content-type") ?? ""
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text()
  if (!response.ok) {
    const error = (payload as { error?: { code?: string; message?: string; details?: unknown } })
      ?.error
    throw new ApiError(
      response.status,
      error?.code ?? "request_failed",
      error?.message ?? `Request failed with HTTP ${response.status}`,
      error?.details,
    )
  }
  return payload as T
}

function json(method: string, body: unknown): RequestInit {
  return { method, body: JSON.stringify(body) }
}

export const api = {
  system: () => request<SystemInfo>("/api/system"),
  diagnostics: () => request<Diagnostics>("/api/system/diagnostics"),
  catalog: () => request<Catalog>("/api/catalog"),

  listWorkspaces: () => request<{ workspaces: Workspace[] }>("/api/workspaces"),
  addWorkspace: (input: { path: string; name?: string }) =>
    request<{ workspace: Workspace }>("/api/workspaces", json("POST", input)),
  removeWorkspace: (id: string) =>
    request<{ ok: boolean }>(`/api/workspaces/${encodeURIComponent(id)}`, { method: "DELETE" }),
  listFiles: (workspaceID: string, path: string) =>
    request<DirectoryListing>(
      `/api/workspaces/${encodeURIComponent(workspaceID)}/files?path=${encodeURIComponent(path)}`,
    ),
  readFile: (workspaceID: string, path: string) =>
    request<{ path: string; size: number; binary: boolean; content: string | null }>(
      `/api/workspaces/${encodeURIComponent(workspaceID)}/file?path=${encodeURIComponent(path)}`,
    ),

  listTasks: (params: {
    status?: string
    workspaceID?: string
    limit?: number
    offset?: number
  }) => {
    const search = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== "") search.set(key, String(value))
    }
    return request<{ tasks: Task[]; total: number; limit: number; offset: number }>(
      `/api/tasks?${search.toString()}`,
    )
  },
  createTask: (input: {
    workspaceID: string
    prompt: string
    title?: string
    model?: ModelRef | null
    agent?: string
    approvalMode?: string
  }) => request<{ task: Task }>("/api/tasks", json("POST", input)),
  getTask: (id: string, eventLimit = 500) =>
    request<TaskDetail>(`/api/tasks/${encodeURIComponent(id)}?eventLimit=${eventLimit}`),
  listTaskEvents: (id: string, limit = 500) =>
    request<{ events: TaskEvent[] }>(`/api/tasks/${encodeURIComponent(id)}/events?limit=${limit}`),
  listApprovals: (id: string) =>
    request<{ approvals: Approval[] }>(`/api/tasks/${encodeURIComponent(id)}/approvals`),
  listArtifacts: (id: string) =>
    request<{ artifacts: Artifact[] }>(`/api/tasks/${encodeURIComponent(id)}/artifacts`),
  listMessages: (id: string) =>
    request<{ messages: AssistantMessage[] }>(`/api/tasks/${encodeURIComponent(id)}/messages`),
  cancelTask: (id: string) =>
    request<{ task: Task }>(`/api/tasks/${encodeURIComponent(id)}/cancel`, { method: "POST" }),
  resumeTask: (id: string) =>
    request<{ task: Task }>(`/api/tasks/${encodeURIComponent(id)}/resume`, { method: "POST" }),
  replyApproval: (id: string, decision: Decision, message?: string) =>
    request<{ approval: Approval }>(
      `/api/approvals/${encodeURIComponent(id)}/reply`,
      json("POST", { decision, ...(message ? { message } : {}) }),
    ),

  getSettings: () => request<{ settings: Settings }>("/api/settings"),
  updateSettings: (patch: Partial<Settings>) =>
    request<{ settings: Settings }>("/api/settings", json("PATCH", patch)),
}

export function subscribeToEvents(
  onUpdate: (update: TaskUpdate) => void,
  onStateChange: (state: "connected" | "reconnecting") => void,
): () => void {
  let stopped = false
  let controller: AbortController | null = null
  let attempt = 0
  let retryTimer: ReturnType<typeof setTimeout> | null = null

  const connect = async () => {
    if (stopped) return
    controller = new AbortController()
    try {
      const response = await fetch("/api/events", {
        headers: { "x-cowork-token": API_TOKEN },
        signal: controller.signal,
      })
      if (!response.ok || !response.body) {
        throw new Error(`Event stream failed with HTTP ${response.status}`)
      }
      onStateChange("connected")
      attempt = 0
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      while (!stopped) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let boundary = buffer.indexOf("\n\n")
        while (boundary !== -1) {
          const chunk = buffer.slice(0, boundary)
          buffer = buffer.slice(boundary + 2)
          boundary = buffer.indexOf("\n\n")
          let eventName = "message"
          const dataLines: string[] = []
          for (const line of chunk.split("\n")) {
            if (line.startsWith("event:")) eventName = line.slice(6).trim()
            else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim())
          }
          if (eventName === "update" && dataLines.length > 0) {
            try {
              onUpdate(JSON.parse(dataLines.join("\n")) as TaskUpdate)
            } catch {
              // Ignore malformed event payloads.
            }
          }
        }
      }
    } catch (error) {
      if (stopped || (error instanceof DOMException && error.name === "AbortError")) return
    }
    if (stopped) return
    onStateChange("reconnecting")
    attempt += 1
    const delay = Math.min(1000 * 2 ** Math.min(attempt, 4), 15_000)
    retryTimer = setTimeout(() => void connect(), delay)
  }

  void connect()

  return () => {
    stopped = true
    controller?.abort()
    if (retryTimer) clearTimeout(retryTimer)
  }
}

export type {
  AgentSummary,
  Approval,
  Artifact,
  AssistantMessage,
  Catalog,
  Diagnostics,
  DirectoryListing,
  McpSummary,
  ProviderSummary,
  Settings,
  SkillSummary,
  Task,
  TaskDetail,
  TaskEvent,
  TaskUpdate,
  Workspace,
}
