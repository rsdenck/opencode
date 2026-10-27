import type { Approval, Task, TaskEvent, TaskStatus } from "./types"

export const STATUS_META: Record<
  TaskStatus,
  { label: string; tone: "neutral" | "info" | "active" | "warn" | "success" | "danger" }
> = {
  queued: { label: "Queued", tone: "neutral" },
  planning: { label: "Planning", tone: "info" },
  running: { label: "Running", tone: "active" },
  awaiting_approval: { label: "Awaiting approval", tone: "warn" },
  completed: { label: "Completed", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  interrupted: { label: "Interrupted", tone: "warn" },
}

export const PHASE_LABELS: Record<string, string> = {
  prepare: "Prepare",
  analyze: "Analyze",
  execute: "Execute",
  verify: "Verify",
  finalize: "Finalize",
}

export function isTerminal(status: TaskStatus): boolean {
  return status === "completed" || status === "failed" || status === "cancelled"
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** exponent
  return `${value.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`
}

export function formatDuration(start: number | null, end: number | null): string {
  if (!start) return "—"
  const effectiveEnd = end ?? Date.now()
  const seconds = Math.max(0, Math.round((effectiveEnd - start) / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  if (minutes < 60) return `${minutes}m ${rest}s`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}

export function formatRelative(timestamp: number | null): string {
  if (!timestamp) return "—"
  const delta = Date.now() - timestamp
  const seconds = Math.round(delta / 1000)
  if (seconds < 45) return "just now"
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(timestamp).toLocaleDateString()
}

export function formatDateTime(timestamp: number | null): string {
  if (!timestamp) return "—"
  return new Date(timestamp).toLocaleString()
}

export function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

export function formatCost(cost: number): string {
  if (!Number.isFinite(cost) || cost <= 0) return "$0.00"
  if (cost < 0.01) return `$${cost.toFixed(4)}`
  return `$${cost.toFixed(2)}`
}

export function formatTokens(tokens: Task["tokens"]): string {
  const total = tokens.input + tokens.output
  if (total < 1000) return `${total} tokens`
  return `${(total / 1000).toFixed(1)}k tokens`
}

export function modelLabel(task: Pick<Task, "model">): string {
  if (!task.model) return "OpenCode default"
  return `${task.model.providerID}/${task.model.id}`
}

export function titleFromPrompt(prompt: string): string {
  const line = prompt.trim().split(/\r?\n/, 1)[0] ?? "Untitled task"
  return line.length > 80 ? `${line.slice(0, 80)}…` : line
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null
}

export function eventSummary(event: TaskEvent): { title: string; detail: string | null } {
  const payload = (event.payload ?? {}) as Record<string, unknown>
  switch (event.type) {
    case "task.created":
      return { title: "Task created", detail: stringValue(payload.workspace) }
    case "task.status": {
      const from = stringValue(payload.from)
      const to = stringValue(payload.to)
      const reason = stringValue(payload.reason)
      return {
        title: to ? `Status → ${STATUS_META[to as TaskStatus]?.label ?? to}` : "Status updated",
        detail: [from && to ? `${from} → ${to}` : null, reason].filter(Boolean).join(" · ") || null,
      }
    }
    case "task.completed":
      return { title: "Task completed", detail: null }
    case "task.failed":
      return { title: "Task failed", detail: stringValue(payload.message) }
    case "task.cancelled":
      return { title: "Task cancelled", detail: null }
    case "task.resumed":
      return { title: "Task resumed", detail: null }
    case "task.warning":
      return { title: "Warning", detail: stringValue(payload.message) }
    case "session.execution.started":
      return { title: "OpenCode execution started", detail: null }
    case "session.execution.succeeded":
      return { title: "OpenCode execution succeeded", detail: null }
    case "session.execution.failed": {
      const error = payload.error as Record<string, unknown> | undefined
      return {
        title: "OpenCode execution failed",
        detail: stringValue(error?.message) ?? null,
      }
    }
    case "session.execution.interrupted":
      return { title: "Execution interrupted", detail: null }
    case "session.step.started":
      return { title: "Model step started", detail: stringValue(payload.agent) }
    case "session.step.ended":
      return { title: "Model step finished", detail: stringValue(payload.finish) }
    case "session.step.failed": {
      const error = payload.error as Record<string, unknown> | undefined
      return { title: "Model step failed", detail: stringValue(error?.message) }
    }
    case "session.tool.called": {
      const input = (payload.input ?? {}) as Record<string, unknown>
      const detail =
        stringValue(input.command) ??
        stringValue(input.path) ??
        stringValue(input.pattern) ??
        stringValue(input.url)
      return { title: `Tool call: ${stringValue(payload.name) ?? "tool"}`, detail }
    }
    case "session.tool.success":
      return { title: `Tool finished: ${stringValue(payload.name) ?? "tool"}`, detail: null }
    case "session.tool.failed": {
      const error = payload.error as Record<string, unknown> | undefined
      return {
        title: `Tool failed: ${stringValue(payload.name) ?? "tool"}`,
        detail: stringValue(error?.message),
      }
    }
    case "permission.asked":
      return {
        title: `Approval requested: ${stringValue(payload.action) ?? "action"}`,
        detail: Array.isArray(payload.resources) ? payload.resources.join(", ") : null,
      }
    case "permission.replied":
      return { title: "Approval answered", detail: stringValue(payload.reply) }
    case "approval.resolved":
      return { title: "Approval resolved", detail: stringValue(payload.decision) }
    case "session.text.ended":
      return { title: "Assistant response finished", detail: null }
    default:
      return { title: event.type.replaceAll(".", " "), detail: null }
  }
}

export function extractStreamText(event: TaskEvent): string | null {
  if (event.type !== "session.text.delta") return null
  const payload = (event.payload ?? {}) as Record<string, unknown>
  const direct = stringValue(payload.text)
  if (direct) return direct
  const delta = payload.delta
  if (typeof delta === "string") return delta
  if (delta && typeof delta === "object") {
    return stringValue((delta as Record<string, unknown>).text)
  }
  return null
}

export function approvalDiffs(
  approval: Approval,
): Array<{ file: string; patch: string; status: string }> {
  const metadata = (approval.metadata ?? {}) as Record<string, unknown>
  if (!Array.isArray(metadata.files)) return []
  return metadata.files.flatMap((entry) => {
    const file = entry as Record<string, unknown>
    const path = stringValue(file.file)
    const patch = stringValue(file.patch)
    if (!path || !patch) return []
    return [{ file: path, patch, status: stringValue(file.status) ?? "modified" }]
  })
}

export function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max)}…`
}

export function jsonPreview(value: unknown, max = 400): string {
  try {
    return truncate(JSON.stringify(value, null, 2) ?? "null", max)
  } catch {
    return String(value)
  }
}

export function sortByNewest(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => b.createdAt - a.createdAt)
}
