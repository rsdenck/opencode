import {
  type Approval,
  type ApprovalStatus,
  type Artifact,
  type ArtifactChange,
  type Decision,
  EMPTY_USAGE,
  ID_PREFIXES,
  type ModelRef,
  newId,
  type Task,
  type TaskEvent,
  type TaskPhase,
  type TaskStatus,
  type TaskStep,
  type TokenUsage,
  type Workspace,
} from "@cowork/core"
import type { Database, SqlValue } from "./database.js"

type Row = Record<string, unknown>

function str(value: unknown): string {
  return String(value ?? "")
}

function nullableStr(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value)
}

function num(value: unknown): number {
  return Number(value ?? 0)
}

function nullableNum(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value)
}

function bool(value: unknown): boolean {
  return Number(value ?? 0) === 1
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || value.length === 0) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function mapWorkspace(row: Row): Workspace {
  return {
    id: str(row.id),
    name: str(row.name),
    path: str(row.path),
    createdAt: num(row.created_at),
    lastUsedAt: nullableNum(row.last_used_at),
  }
}

function mapTask(row: Row): Task {
  const model: ModelRef | null =
    row.model_provider && row.model_id
      ? {
          providerID: str(row.model_provider),
          id: str(row.model_id),
          ...(row.model_variant ? { variant: str(row.model_variant) } : {}),
        }
      : null

  return {
    id: str(row.id),
    title: str(row.title),
    prompt: str(row.prompt),
    workspaceID: str(row.workspace_id),
    workspacePath: str(row.workspace_path),
    sessionID: nullableStr(row.session_id),
    status: str(row.status) as TaskStatus,
    phase: str(row.phase) as TaskPhase,
    model,
    agent: str(row.agent),
    approvalMode: str(row.approval_mode) as Task["approvalMode"],
    createdAt: num(row.created_at),
    updatedAt: num(row.updated_at),
    startedAt: nullableNum(row.started_at),
    finishedAt: nullableNum(row.finished_at),
    error: nullableStr(row.error),
    summary: nullableStr(row.summary),
    planSummary: nullableStr(row.plan_summary),
    cost: num(row.cost),
    tokens: { ...EMPTY_USAGE, ...parseJson<TokenUsage>(row.tokens_json, EMPTY_USAGE) },
    resumable: bool(row.resumable),
  }
}

function mapStep(row: Row): TaskStep {
  return {
    id: str(row.id),
    taskID: str(row.task_id),
    phase: str(row.phase) as TaskPhase,
    title: str(row.title),
    status: str(row.status) as TaskStep["status"],
    detail: nullableStr(row.detail),
    ordinal: num(row.ordinal),
    createdAt: num(row.created_at),
    startedAt: nullableNum(row.started_at),
    finishedAt: nullableNum(row.finished_at),
  }
}

function mapEvent(row: Row): TaskEvent {
  return {
    id: str(row.id),
    taskID: str(row.task_id),
    seq: num(row.seq),
    type: str(row.type),
    payload: parseJson<unknown>(row.payload_json, null),
    createdAt: num(row.created_at),
  }
}

function mapApproval(row: Row): Approval {
  return {
    id: str(row.id),
    taskID: str(row.task_id),
    requestID: str(row.request_id),
    action: str(row.action),
    resources: parseJson<string[]>(row.resources_json, []),
    metadata: parseJson<unknown>(row.metadata_json, null),
    status: str(row.status) as ApprovalStatus,
    decision: nullableStr(row.decision) as Decision | null,
    message: nullableStr(row.message),
    createdAt: num(row.created_at),
    resolvedAt: nullableNum(row.resolved_at),
  }
}

function mapArtifact(row: Row): Artifact {
  return {
    id: str(row.id),
    taskID: str(row.task_id),
    path: str(row.path),
    change: str(row.change) as ArtifactChange,
    size: num(row.size),
    mtime: num(row.mtime),
  }
}

export class WorkspaceRepository {
  constructor(private readonly db: Database) {}

  create(input: { name: string; path: string }): Workspace {
    const id = newId(ID_PREFIXES.workspace)
    const createdAt = Date.now()
    this.db.raw
      .prepare("INSERT INTO workspaces (id, name, path, created_at) VALUES (?, ?, ?, ?)")
      .run(id, input.name, input.path, createdAt)
    return { id, name: input.name, path: input.path, createdAt, lastUsedAt: null }
  }

  get(id: string): Workspace | null {
    const row = this.db.raw.prepare("SELECT * FROM workspaces WHERE id = ?").get(id) as
      | Row
      | undefined
    return row ? mapWorkspace(row) : null
  }

  findByPath(path: string): Workspace | null {
    const row = this.db.raw.prepare("SELECT * FROM workspaces WHERE path = ?").get(path) as
      | Row
      | undefined
    return row ? mapWorkspace(row) : null
  }

  list(): Workspace[] {
    return (
      this.db.raw
        .prepare(
          `SELECT w.*, (SELECT MAX(created_at) FROM tasks t WHERE t.workspace_id = w.id) AS last_task
           FROM workspaces w ORDER BY COALESCE(w.last_used_at, w.created_at) DESC`,
        )
        .all() as Row[]
    ).map(mapWorkspace)
  }

  touch(id: string, at = Date.now()): void {
    this.db.raw.prepare("UPDATE workspaces SET last_used_at = ? WHERE id = ?").run(at, id)
  }

  remove(id: string): boolean {
    const result = this.db.raw.prepare("DELETE FROM workspaces WHERE id = ?").run(id)
    return Number(result.changes) > 0
  }
}

const TASK_PATCH_FIELDS: Record<string, string> = {
  title: "title",
  sessionID: "session_id",
  status: "status",
  phase: "phase",
  startedAt: "started_at",
  finishedAt: "finished_at",
  error: "error",
  summary: "summary",
  planSummary: "plan_summary",
  cost: "cost",
  tokens: "tokens_json",
  resumable: "resumable",
  agent: "agent",
  approvalMode: "approval_mode",
  workspacePath: "workspace_path",
}

export interface TaskListQuery {
  limit: number
  offset: number
  status?: TaskStatus
  workspaceID?: string
}

export class TaskRepository {
  constructor(private readonly db: Database) {}

  insert(task: Task): Task {
    this.db.raw
      .prepare(
        `INSERT INTO tasks (
          id, title, prompt, workspace_id, workspace_path, session_id, status, phase,
          model_provider, model_id, model_variant, agent, approval_mode, created_at,
          updated_at, started_at, finished_at, error, summary, plan_summary, cost,
          tokens_json, resumable
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        task.id,
        task.title,
        task.prompt,
        task.workspaceID,
        task.workspacePath,
        task.sessionID,
        task.status,
        task.phase,
        task.model?.providerID ?? null,
        task.model?.id ?? null,
        task.model?.variant ?? null,
        task.agent,
        task.approvalMode,
        task.createdAt,
        task.updatedAt,
        task.startedAt,
        task.finishedAt,
        task.error,
        task.summary,
        task.planSummary,
        task.cost,
        JSON.stringify(task.tokens),
        task.resumable ? 1 : 0,
      )
    return task
  }

  get(id: string): Task | null {
    const row = this.db.raw.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as Row | undefined
    return row ? mapTask(row) : null
  }

  getBySession(sessionID: string): Task | null {
    const row = this.db.raw
      .prepare("SELECT * FROM tasks WHERE session_id = ? ORDER BY created_at DESC LIMIT 1")
      .get(sessionID) as Row | undefined
    return row ? mapTask(row) : null
  }

  list(query: TaskListQuery): { items: Task[]; total: number } {
    const clauses: string[] = []
    const params: SqlValue[] = []
    if (query.status) {
      clauses.push("status = ?")
      params.push(query.status)
    }
    if (query.workspaceID) {
      clauses.push("workspace_id = ?")
      params.push(query.workspaceID)
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : ""
    const totalRow = this.db.raw
      .prepare(`SELECT COUNT(*) AS count FROM tasks ${where}`)
      .get(...params) as { count: number }
    const rows = this.db.raw
      .prepare(`SELECT * FROM tasks ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .all(...params, query.limit, query.offset) as Row[]
    return { items: rows.map(mapTask), total: Number(totalRow.count) }
  }

  update(id: string, patch: Partial<Task>): Task | null {
    const entries = Object.entries(patch).filter(([key]) => key in TASK_PATCH_FIELDS)
    const assignments: string[] = []
    const params: SqlValue[] = []
    for (const [key, value] of entries) {
      const column = TASK_PATCH_FIELDS[key]
      if (!column) continue
      assignments.push(`${column} = ?`)
      if (key === "tokens") params.push(JSON.stringify(value))
      else if (key === "resumable") params.push(value ? 1 : 0)
      else params.push((value as SqlValue) ?? null)
    }
    assignments.push("updated_at = ?")
    params.push(Date.now())
    params.push(id)
    this.db.raw.prepare(`UPDATE tasks SET ${assignments.join(", ")} WHERE id = ?`).run(...params)
    return this.get(id)
  }

  setStatus(
    id: string,
    status: TaskStatus,
    extra: Partial<
      Pick<
        Task,
        | "error"
        | "finishedAt"
        | "resumable"
        | "summary"
        | "planSummary"
        | "phase"
        | "cost"
        | "tokens"
        | "startedAt"
      >
    > = {},
  ): Task | null {
    return this.update(id, { status, ...extra })
  }

  /**
   * Marks tasks left in an active state by a previous process as interrupted.
   * OpenCode sessions persist, so these tasks can normally be resumed.
   */
  markActiveAsInterrupted(reason: string): Task[] {
    const rows = this.db.raw
      .prepare(
        "SELECT * FROM tasks WHERE status IN ('queued','planning','running','awaiting_approval')",
      )
      .all() as Row[]
    if (rows.length === 0) return []
    const now = Date.now()
    this.db.transaction(() => {
      for (const row of rows) {
        this.db.raw
          .prepare(
            "UPDATE tasks SET status = 'interrupted', error = ?, resumable = 1, updated_at = ? WHERE id = ?",
          )
          .run(reason, now, str(row.id))
      }
    })
    return rows.map((row) => ({
      ...mapTask(row),
      status: "interrupted",
      error: reason,
      resumable: true,
    }))
  }

  countActive(): number {
    const row = this.db.raw
      .prepare(
        "SELECT COUNT(*) AS count FROM tasks WHERE status IN ('queued','planning','running','awaiting_approval')",
      )
      .get() as { count: number }
    return Number(row.count)
  }
}

export class StepRepository {
  constructor(private readonly db: Database) {}

  create(input: {
    taskID: string
    phase: TaskPhase
    title: string
    status?: TaskStep["status"]
    detail?: string | null
    ordinal: number
    startedAt?: number | null
  }): TaskStep {
    const id = newId(ID_PREFIXES.step)
    const now = Date.now()
    const step: TaskStep = {
      id,
      taskID: input.taskID,
      phase: input.phase,
      title: input.title,
      status: input.status ?? "pending",
      detail: input.detail ?? null,
      ordinal: input.ordinal,
      createdAt: now,
      startedAt: input.startedAt ?? null,
      finishedAt: null,
    }
    this.db.raw
      .prepare(
        `INSERT INTO task_steps (id, task_id, phase, title, status, detail, ordinal, created_at, started_at, finished_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        step.id,
        step.taskID,
        step.phase,
        step.title,
        step.status,
        step.detail,
        step.ordinal,
        step.createdAt,
        step.startedAt,
        step.finishedAt,
      )
    return step
  }

  update(id: string, patch: Partial<TaskStep>): TaskStep | null {
    const fields: Record<string, string> = {
      title: "title",
      status: "status",
      detail: "detail",
      startedAt: "started_at",
      finishedAt: "finished_at",
    }
    const assignments: string[] = []
    const params: SqlValue[] = []
    for (const [key, value] of Object.entries(patch)) {
      const column = fields[key]
      if (!column) continue
      assignments.push(`${column} = ?`)
      params.push((value as SqlValue) ?? null)
    }
    if (assignments.length === 0) return this.get(id)
    params.push(id)
    this.db.raw
      .prepare(`UPDATE task_steps SET ${assignments.join(", ")} WHERE id = ?`)
      .run(...params)
    return this.get(id)
  }

  get(id: string): TaskStep | null {
    const row = this.db.raw.prepare("SELECT * FROM task_steps WHERE id = ?").get(id) as
      | Row
      | undefined
    return row ? mapStep(row) : null
  }

  listByTask(taskID: string): TaskStep[] {
    return (
      this.db.raw
        .prepare("SELECT * FROM task_steps WHERE task_id = ? ORDER BY ordinal ASC")
        .all(taskID) as Row[]
    ).map(mapStep)
  }

  findByTitle(taskID: string, title: string): TaskStep | null {
    const row = this.db.raw
      .prepare(
        "SELECT * FROM task_steps WHERE task_id = ? AND title = ? ORDER BY ordinal DESC LIMIT 1",
      )
      .get(taskID, title) as Row | undefined
    return row ? mapStep(row) : null
  }

  markRunningAsFailed(taskID: string, detail: string, now = Date.now()): void {
    this.db.raw
      .prepare(
        "UPDATE task_steps SET status = 'failed', detail = ?, finished_at = ? WHERE task_id = ? AND status = 'running'",
      )
      .run(detail, now, taskID)
  }

  markPendingAsSkipped(taskID: string, now = Date.now()): void {
    this.db.raw
      .prepare(
        "UPDATE task_steps SET status = 'skipped', finished_at = ? WHERE task_id = ? AND status = 'pending'",
      )
      .run(now, taskID)
  }

  markRunningAsCompleted(taskID: string, now = Date.now()): void {
    this.db.raw
      .prepare(
        "UPDATE task_steps SET status = 'completed', finished_at = ? WHERE task_id = ? AND status = 'running'",
      )
      .run(now, taskID)
  }
}

export class EventRepository {
  constructor(private readonly db: Database) {}

  append(taskID: string, type: string, payload: unknown, createdAt = Date.now()): TaskEvent {
    return this.db.transaction(() => {
      const row = this.db.raw
        .prepare("SELECT COALESCE(MAX(seq), 0) AS seq FROM task_events WHERE task_id = ?")
        .get(taskID) as { seq: number }
      const seq = Number(row.seq) + 1
      const event: TaskEvent = {
        id: newId(ID_PREFIXES.event),
        taskID,
        seq,
        type,
        payload,
        createdAt,
      }
      this.db.raw
        .prepare(
          "INSERT INTO task_events (id, task_id, seq, type, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .run(
          event.id,
          event.taskID,
          event.seq,
          event.type,
          JSON.stringify(payload ?? null),
          createdAt,
        )
      return event
    })
  }

  list(taskID: string, limit = 500): TaskEvent[] {
    const rows = this.db.raw
      .prepare("SELECT * FROM task_events WHERE task_id = ? ORDER BY seq DESC LIMIT ?")
      .all(taskID, limit) as Row[]
    return rows.reverse().map(mapEvent)
  }

  count(taskID: string): number {
    const row = this.db.raw
      .prepare("SELECT COUNT(*) AS count FROM task_events WHERE task_id = ?")
      .get(taskID) as { count: number }
    return Number(row.count)
  }
}

export class ApprovalRepository {
  constructor(private readonly db: Database) {}

  create(input: {
    taskID: string
    requestID: string
    action: string
    resources: string[]
    metadata: unknown
  }): Approval {
    const existing = this.findByRequest(input.requestID)
    if (existing) return existing
    const approval: Approval = {
      id: newId(ID_PREFIXES.approval),
      taskID: input.taskID,
      requestID: input.requestID,
      action: input.action,
      resources: input.resources,
      metadata: input.metadata,
      status: "pending",
      decision: null,
      message: null,
      createdAt: Date.now(),
      resolvedAt: null,
    }
    this.db.raw
      .prepare(
        `INSERT INTO approvals (id, task_id, request_id, action, resources_json, metadata_json, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        approval.id,
        approval.taskID,
        approval.requestID,
        approval.action,
        JSON.stringify(approval.resources),
        JSON.stringify(approval.metadata ?? null),
        approval.status,
        approval.createdAt,
      )
    return approval
  }

  get(id: string): Approval | null {
    const row = this.db.raw.prepare("SELECT * FROM approvals WHERE id = ?").get(id) as
      | Row
      | undefined
    return row ? mapApproval(row) : null
  }

  findByRequest(requestID: string): Approval | null {
    const row = this.db.raw
      .prepare("SELECT * FROM approvals WHERE request_id = ?")
      .get(requestID) as Row | undefined
    return row ? mapApproval(row) : null
  }

  listByTask(taskID: string): Approval[] {
    return (
      this.db.raw
        .prepare("SELECT * FROM approvals WHERE task_id = ? ORDER BY created_at ASC")
        .all(taskID) as Row[]
    ).map(mapApproval)
  }

  listPending(): Approval[] {
    return (
      this.db.raw
        .prepare("SELECT * FROM approvals WHERE status = 'pending' ORDER BY created_at ASC")
        .all() as Row[]
    ).map(mapApproval)
  }

  resolve(
    id: string,
    input: {
      status: Exclude<ApprovalStatus, "pending">
      decision?: Decision | null
      message?: string | null
    },
  ): Approval | null {
    this.db.raw
      .prepare(
        "UPDATE approvals SET status = ?, decision = ?, message = ?, resolved_at = ? WHERE id = ? AND status = 'pending'",
      )
      .run(input.status, input.decision ?? null, input.message ?? null, Date.now(), id)
    return this.get(id)
  }

  expirePending(): number {
    const result = this.db.raw
      .prepare("UPDATE approvals SET status = 'expired', resolved_at = ? WHERE status = 'pending'")
      .run(Date.now())
    return Number(result.changes)
  }

  expireForTask(taskID: string): Approval[] {
    const pending = this.listByTask(taskID).filter((approval) => approval.status === "pending")
    const expired: Approval[] = []
    for (const approval of pending) {
      const updated = this.resolve(approval.id, { status: "expired" })
      if (updated) expired.push(updated)
    }
    return expired
  }
}

export class ArtifactRepository {
  constructor(private readonly db: Database) {}

  replaceForTask(taskID: string, artifacts: Array<Omit<Artifact, "id" | "taskID">>): Artifact[] {
    return this.db.transaction(() => {
      this.db.raw.prepare("DELETE FROM artifacts WHERE task_id = ?").run(taskID)
      const inserted: Artifact[] = []
      for (const artifact of artifacts) {
        const record: Artifact = { id: newId("art"), taskID, ...artifact }
        this.db.raw
          .prepare(
            "INSERT INTO artifacts (id, task_id, path, change, size, mtime) VALUES (?, ?, ?, ?, ?, ?)",
          )
          .run(record.id, record.taskID, record.path, record.change, record.size, record.mtime)
        inserted.push(record)
      }
      return inserted
    })
  }

  listByTask(taskID: string): Artifact[] {
    return (
      this.db.raw
        .prepare("SELECT * FROM artifacts WHERE task_id = ? ORDER BY path ASC")
        .all(taskID) as Row[]
    ).map(mapArtifact)
  }
}

export class SettingsRepository {
  constructor(private readonly db: Database) {}

  getAll(): Record<string, unknown> {
    const rows = this.db.raw.prepare("SELECT key, value_json FROM settings").all() as Array<{
      key: string
      value_json: string
    }>
    const result: Record<string, unknown> = {}
    for (const row of rows) {
      result[row.key] = parseJson<unknown>(row.value_json, null)
    }
    return result
  }

  set(key: string, value: unknown): void {
    this.db.raw
      .prepare(
        "INSERT INTO settings (key, value_json) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json",
      )
      .run(key, JSON.stringify(value))
  }

  setMany(values: Record<string, unknown>): void {
    this.db.transaction(() => {
      for (const [key, value] of Object.entries(values)) this.set(key, value)
    })
  }
}

export class Store {
  readonly workspaces: WorkspaceRepository
  readonly tasks: TaskRepository
  readonly steps: StepRepository
  readonly events: EventRepository
  readonly approvals: ApprovalRepository
  readonly artifacts: ArtifactRepository
  readonly settings: SettingsRepository

  constructor(readonly db: Database) {
    this.workspaces = new WorkspaceRepository(db)
    this.tasks = new TaskRepository(db)
    this.steps = new StepRepository(db)
    this.events = new EventRepository(db)
    this.approvals = new ApprovalRepository(db)
    this.artifacts = new ArtifactRepository(db)
    this.settings = new SettingsRepository(db)
  }

  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)
  }

  close(): void {
    this.db.close()
  }
}
