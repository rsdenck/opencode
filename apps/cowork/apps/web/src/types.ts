export type TaskStatus =
  | "queued"
  | "planning"
  | "running"
  | "awaiting_approval"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted"

export type TaskPhase = "prepare" | "analyze" | "execute" | "verify" | "finalize"
export type ApprovalMode = "ask" | "auto" | "strict"
export type Decision = "once" | "always" | "reject"

export interface ModelRef {
  providerID: string
  id: string
  variant?: string
}

export interface TokenUsage {
  input: number
  output: number
  reasoning: number
  cacheRead: number
  cacheWrite: number
}

export interface Task {
  id: string
  title: string
  prompt: string
  workspaceID: string
  workspacePath: string
  sessionID: string | null
  status: TaskStatus
  phase: TaskPhase
  model: ModelRef | null
  agent: string
  approvalMode: ApprovalMode
  createdAt: number
  updatedAt: number
  startedAt: number | null
  finishedAt: number | null
  error: string | null
  summary: string | null
  planSummary: string | null
  cost: number
  tokens: TokenUsage
  resumable: boolean
}

export interface TaskStep {
  id: string
  taskID: string
  phase: TaskPhase
  title: string
  status: "pending" | "running" | "completed" | "failed" | "skipped"
  detail: string | null
  ordinal: number
  createdAt: number
  startedAt: number | null
  finishedAt: number | null
}

export interface TaskEvent {
  id: string
  taskID: string
  seq: number
  type: string
  payload: unknown
  createdAt: number
}

export interface Approval {
  id: string
  taskID: string
  requestID: string
  action: string
  resources: string[]
  metadata: unknown
  status: "pending" | "approved" | "rejected" | "expired"
  decision: Decision | null
  message: string | null
  createdAt: number
  resolvedAt: number | null
}

export interface Artifact {
  id: string
  taskID: string
  path: string
  change: "created" | "modified" | "deleted"
  size: number
  mtime: number
}

export interface TaskDetail {
  task: Task
  workspace: Workspace | null
  steps: TaskStep[]
  approvals: Approval[]
  artifacts: Artifact[]
  events: TaskEvent[]
}

export interface Workspace {
  id: string
  name: string
  path: string
  createdAt: number
  lastUsedAt: number | null
}

export interface ModelSummary {
  providerID: string
  id: string
  name: string
  contextLimit: number
  outputLimit: number
  status: string
  variants: string[]
  capabilities: Record<string, unknown>
}

export interface ProviderSummary {
  id: string
  name: string
  models: ModelSummary[]
}

export interface AgentSummary {
  id: string
  name: string
  description: string | null
  mode: string
  hidden: boolean
}

export interface SkillSummary {
  id: string
  name: string
  description: string | null
  autoinvoke: boolean
}

export interface McpSummary {
  name: string
  status: string
  error?: string
}

export interface Settings {
  defaultModel: ModelRef | null
  defaultAgent: string
  defaultApprovalMode: ApprovalMode
  taskRetentionDays: number
}

export interface OpenCodeHealth {
  connected: boolean
  version: string | null
  pid: number | null
  url: string | null
  mode: string
  error: string | null
  checkedAt: number
}

export interface SystemInfo {
  version: string
  uptimeSeconds: number
  opencode: OpenCodeHealth
  settings: Settings
  counts: { tasks: number; activeTasks: number; workspaces: number }
  database: { schemaVersion: number; file: string }
  limits: { maxPromptChars: number; maxFiles: number; bodyLimit: number }
}

export interface Catalog {
  providers: ProviderSummary[]
  agents: AgentSummary[]
  skills: SkillSummary[]
  mcp: McpSummary[]
  settings: Settings
}

export interface Diagnostics {
  health: OpenCodeHealth
  providers: Array<{ id: string; name: string; models: number }>
  agents: Array<{ id: string; name: string; mode: string; hidden: boolean }>
  skills: SkillSummary[]
  mcp: McpSummary[]
}

export type TaskUpdate =
  | { kind: "task.created"; taskID: string; task: Task }
  | { kind: "task.updated"; taskID: string; task: Task }
  | { kind: "task.event"; taskID: string; event: TaskEvent }
  | { kind: "approval.updated"; taskID: string; approval: Approval }

export interface AssistantMessage {
  text: string
  reasoning: string
  finish: string | null
  toolCalls: Array<{ id: string; name: string; status: string | null; input: unknown }>
}

export interface DirectoryListing {
  path: string
  entries: Array<{
    name: string
    path: string
    type: "file" | "directory" | "symlink" | "other"
    size: number
    mtime: number
  }>
  truncated: boolean
}
