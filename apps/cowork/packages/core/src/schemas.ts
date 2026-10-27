import { z } from "zod"

export const TASK_STATUSES = [
  "queued",
  "planning",
  "running",
  "awaiting_approval",
  "completed",
  "failed",
  "cancelled",
  "interrupted",
] as const

export type TaskStatus = (typeof TASK_STATUSES)[number]

export const TERMINAL_STATUSES: readonly TaskStatus[] = [
  "completed",
  "failed",
  "cancelled",
] as const

export const ACTIVE_STATUSES: readonly TaskStatus[] = [
  "queued",
  "planning",
  "running",
  "awaiting_approval",
] as const

export const TaskStatusSchema = z.enum(TASK_STATUSES)

export const TASK_PHASES = ["prepare", "analyze", "execute", "verify", "finalize"] as const
export const TaskPhaseSchema = z.enum(TASK_PHASES)
export type TaskPhase = (typeof TASK_PHASES)[number]

export const STEP_STATUSES = ["pending", "running", "completed", "failed", "skipped"] as const
export const StepStatusSchema = z.enum(STEP_STATUSES)
export type StepStatus = (typeof STEP_STATUSES)[number]

export const APPROVAL_MODES = ["ask", "auto", "strict"] as const
export const ApprovalModeSchema = z.enum(APPROVAL_MODES)
export type ApprovalMode = (typeof APPROVAL_MODES)[number]

export const APPROVAL_STATUSES = ["pending", "approved", "rejected", "expired"] as const
export const ApprovalStatusSchema = z.enum(APPROVAL_STATUSES)
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number]

export const DECISIONS = ["once", "always", "reject"] as const
export const DecisionSchema = z.enum(DECISIONS)
export type Decision = (typeof DECISIONS)[number]

export const ModelRefSchema = z.object({
  providerID: z.string().min(1).max(120),
  id: z.string().min(1).max(240),
  variant: z.string().min(1).max(80).optional(),
})
export type ModelRef = z.infer<typeof ModelRefSchema>

export const WorkspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  createdAt: z.number().int(),
  lastUsedAt: z.number().int().nullable(),
})
export type Workspace = z.infer<typeof WorkspaceSchema>

export const TokenUsageSchema = z.object({
  input: z.number().int().nonnegative().default(0),
  output: z.number().int().nonnegative().default(0),
  reasoning: z.number().int().nonnegative().default(0),
  cacheRead: z.number().int().nonnegative().default(0),
  cacheWrite: z.number().int().nonnegative().default(0),
})
export type TokenUsage = z.infer<typeof TokenUsageSchema>

export const EMPTY_USAGE: TokenUsage = {
  input: 0,
  output: 0,
  reasoning: 0,
  cacheRead: 0,
  cacheWrite: 0,
}

export const TaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  prompt: z.string(),
  workspaceID: z.string(),
  workspacePath: z.string(),
  sessionID: z.string().nullable(),
  status: TaskStatusSchema,
  phase: TaskPhaseSchema,
  model: ModelRefSchema.nullable(),
  agent: z.string(),
  approvalMode: ApprovalModeSchema,
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  startedAt: z.number().int().nullable(),
  finishedAt: z.number().int().nullable(),
  error: z.string().nullable(),
  summary: z.string().nullable(),
  planSummary: z.string().nullable(),
  cost: z.number().nonnegative(),
  tokens: TokenUsageSchema,
  resumable: z.boolean(),
})
export type Task = z.infer<typeof TaskSchema>

export const TaskStepSchema = z.object({
  id: z.string(),
  taskID: z.string(),
  phase: TaskPhaseSchema,
  title: z.string(),
  status: StepStatusSchema,
  detail: z.string().nullable(),
  ordinal: z.number().int(),
  createdAt: z.number().int(),
  startedAt: z.number().int().nullable(),
  finishedAt: z.number().int().nullable(),
})
export type TaskStep = z.infer<typeof TaskStepSchema>

export const TaskEventSchema = z.object({
  id: z.string(),
  taskID: z.string(),
  seq: z.number().int(),
  type: z.string(),
  payload: z.unknown(),
  createdAt: z.number().int(),
})
export type TaskEvent = z.infer<typeof TaskEventSchema>

export const ApprovalSchema = z.object({
  id: z.string(),
  taskID: z.string(),
  requestID: z.string(),
  action: z.string(),
  resources: z.array(z.string()),
  metadata: z.unknown(),
  status: ApprovalStatusSchema,
  decision: DecisionSchema.nullable(),
  message: z.string().nullable(),
  createdAt: z.number().int(),
  resolvedAt: z.number().int().nullable(),
})
export type Approval = z.infer<typeof ApprovalSchema>

export const ArtifactChangeSchema = z.enum(["created", "modified", "deleted"])
export type ArtifactChange = z.infer<typeof ArtifactChangeSchema>

export const ArtifactSchema = z.object({
  id: z.string(),
  taskID: z.string(),
  path: z.string(),
  change: ArtifactChangeSchema,
  size: z.number().int().nonnegative(),
  mtime: z.number().int().nonnegative(),
})
export type Artifact = z.infer<typeof ArtifactSchema>

export const TaskDetailSchema = z.object({
  task: TaskSchema,
  workspace: WorkspaceSchema.nullable(),
  steps: z.array(TaskStepSchema),
  approvals: z.array(ApprovalSchema),
  artifacts: z.array(ArtifactSchema),
  events: z.array(TaskEventSchema),
})
export type TaskDetail = z.infer<typeof TaskDetailSchema>

export const CreateTaskInputSchema = z.object({
  workspaceID: z.string().min(1),
  prompt: z.string().trim().min(1).max(20_000),
  title: z.string().trim().min(1).max(160).optional(),
  model: ModelRefSchema.nullable().optional(),
  agent: z.string().min(1).max(80).optional(),
  approvalMode: ApprovalModeSchema.optional(),
})
export type CreateTaskInput = z.infer<typeof CreateTaskInputSchema>

export const CreateWorkspaceInputSchema = z.object({
  path: z.string().trim().min(1).max(4096),
  name: z.string().trim().min(1).max(120).optional(),
})
export type CreateWorkspaceInput = z.infer<typeof CreateWorkspaceInputSchema>

export const ReplyApprovalInputSchema = z.object({
  decision: DecisionSchema,
  message: z.string().trim().max(2000).optional(),
})
export type ReplyApprovalInput = z.infer<typeof ReplyApprovalInputSchema>

export const SettingsSchema = z.object({
  defaultModel: ModelRefSchema.nullable(),
  defaultAgent: z.string().min(1).max(80),
  defaultApprovalMode: ApprovalModeSchema,
  taskRetentionDays: z.number().int().min(1).max(3650),
})
export type Settings = z.infer<typeof SettingsSchema>

export const DEFAULT_SETTINGS: Settings = {
  defaultModel: null,
  defaultAgent: "build",
  defaultApprovalMode: "ask",
  taskRetentionDays: 365,
}

export const UpdateSettingsInputSchema = SettingsSchema.partial()
export type UpdateSettingsInput = z.infer<typeof UpdateSettingsInputSchema>

export const PaginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

export const ListTasksQuerySchema = PaginationSchema.extend({
  status: TaskStatusSchema.optional(),
  workspaceID: z.string().optional(),
})
export type ListTasksQuery = z.infer<typeof ListTasksQuerySchema>
