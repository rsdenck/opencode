import { CoworkError } from "./errors.js"
import { TASK_STATUSES, type TaskStatus, TERMINAL_STATUSES } from "./schemas.js"

/**
 * Explicit task lifecycle. Transitions are intentionally narrow: callers must
 * use the engine methods, which also persist the state change and emit events.
 */
const TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  queued: ["planning", "cancelled", "failed"],
  planning: ["running", "awaiting_approval", "completed", "failed", "cancelled", "interrupted"],
  running: ["awaiting_approval", "completed", "failed", "cancelled", "interrupted"],
  awaiting_approval: ["running", "completed", "failed", "cancelled", "interrupted"],
  completed: [],
  failed: ["queued"],
  cancelled: [],
  interrupted: ["queued", "cancelled"],
}

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  if (from === to) return false
  return TRANSITIONS[from].includes(to)
}

export function allowedTransitions(from: TaskStatus): readonly TaskStatus[] {
  return TRANSITIONS[from]
}

export function assertTransition(from: TaskStatus, to: TaskStatus): void {
  if (!canTransition(from, to)) {
    throw new CoworkError(
      "invalid_transition",
      `Cannot transition task from "${from}" to "${to}"`,
      { status: 409, details: { from, to, allowed: TRANSITIONS[from] } },
    )
  }
}

export function isTerminal(status: TaskStatus): boolean {
  return TERMINAL_STATUSES.includes(status)
}

export function isActive(status: TaskStatus): boolean {
  return !isTerminal(status) && status !== "interrupted"
}

export function isTaskStatus(value: string): value is TaskStatus {
  return (TASK_STATUSES as readonly string[]).includes(value)
}
