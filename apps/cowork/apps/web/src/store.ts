import { createSignal } from "solid-js"
import { ApiError, api, subscribeToEvents } from "./api"
import type {
  Approval,
  Catalog,
  Diagnostics,
  Settings,
  SystemInfo,
  Task,
  TaskDetail,
  TaskEvent,
  TaskUpdate,
  Workspace,
} from "./types"
import { extractStreamText } from "./utils"

export type Route =
  | { name: "dashboard" }
  | { name: "tasks" }
  | { name: "task"; id: string }
  | { name: "workspaces" }
  | { name: "settings" }

export function parseRoute(hash: string): Route {
  const clean = hash.replace(/^#\/?/, "")
  const [head, id] = clean.split("/")
  if (head === "tasks" && id) return { name: "task", id }
  if (head === "tasks") return { name: "tasks" }
  if (head === "workspaces") return { name: "workspaces" }
  if (head === "settings") return { name: "settings" }
  return { name: "dashboard" }
}

export function navigate(path: string): void {
  const hash = path.startsWith("#") ? path : `#${path.startsWith("/") ? path : `/${path}`}`
  if (window.location.hash === hash) {
    setRoute(parseRoute(hash))
    return
  }
  window.location.hash = hash
}

export const [route, setRoute] = createSignal<Route>(parseRoute(window.location.hash))
export const [system, setSystem] = createSignal<SystemInfo | null>(null)
export const [catalog, setCatalog] = createSignal<Catalog | null>(null)
export const [diagnostics, setDiagnostics] = createSignal<Diagnostics | null>(null)
export const [workspaces, setWorkspaces] = createSignal<Workspace[]>([])
export const [tasks, setTasks] = createSignal<Task[]>([])
export const [taskTotal, setTaskTotal] = createSignal(0)
export const [taskFilter, setTaskFilter] = createSignal<string>("")
export const [selectedTask, setSelectedTask] = createSignal<TaskDetail | null>(null)
export const [selectedTaskID, setSelectedTaskID] = createSignal<string | null>(null)
export const [liveEvents, setLiveEvents] = createSignal<TaskEvent[]>([])
export const [liveText, setLiveText] = createSignal("")
export const [streamState, setStreamState] = createSignal<
  "connecting" | "connected" | "reconnecting"
>("connecting")
export const [toast, setToast] = createSignal<{ message: string; tone: "info" | "error" } | null>(
  null,
)
export const [booting, setBooting] = createSignal(true)
export const [bootError, setBootError] = createSignal<string | null>(null)

let toastTimer: ReturnType<typeof setTimeout> | null = null

export function notify(message: string, tone: "info" | "error" = "info"): void {
  setToast({ message, tone })
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => setToast(null), 6000)
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error) return error.message
  return String(error)
}

export async function loadSystem(): Promise<void> {
  try {
    setSystem(await api.system())
  } catch (error) {
    setBootError(errorMessage(error))
  }
}

export async function loadCatalog(): Promise<void> {
  try {
    setCatalog(await api.catalog())
  } catch (error) {
    notify(`Could not load model catalog: ${errorMessage(error)}`, "error")
  }
}

export async function loadDiagnostics(): Promise<void> {
  try {
    setDiagnostics(await api.diagnostics())
  } catch (error) {
    notify(errorMessage(error), "error")
  }
}

export async function loadWorkspaces(): Promise<void> {
  try {
    const result = await api.listWorkspaces()
    setWorkspaces(result.workspaces)
  } catch (error) {
    notify(`Could not load workspaces: ${errorMessage(error)}`, "error")
  }
}

export async function loadTasks(): Promise<void> {
  try {
    const result = await api.listTasks({
      limit: 100,
      status: taskFilter() || undefined,
    })
    setTasks(result.tasks)
    setTaskTotal(result.total)
  } catch (error) {
    notify(`Could not load tasks: ${errorMessage(error)}`, "error")
  }
}

let detailRequest = 0
export async function loadTask(id: string): Promise<void> {
  const requestID = ++detailRequest
  try {
    const detail = await api.getTask(id)
    if (requestID !== detailRequest) return
    const changed = selectedTaskID() !== id
    setSelectedTask(detail)
    setSelectedTaskID(id)
    if (changed) {
      setLiveText("")
      setLiveEvents([])
    }
    setTasks((current) => {
      const index = current.findIndex((task) => task.id === id)
      if (index === -1) return current
      const next = [...current]
      next[index] = detail.task
      return next
    })
  } catch (error) {
    if (requestID !== detailRequest) return
    setSelectedTask(null)
    notify(`Could not load task: ${errorMessage(error)}`, "error")
  }
}

const refreshTimers = new Map<string, ReturnType<typeof setTimeout>>()
function scheduleTaskRefresh(id: string): void {
  const existing = refreshTimers.get(id)
  if (existing) clearTimeout(existing)
  refreshTimers.set(
    id,
    setTimeout(() => {
      refreshTimers.delete(id)
      void loadTask(id)
    }, 800),
  )
}

function applyTask(task: Task): void {
  setTasks((current) => {
    const index = current.findIndex((entry) => entry.id === task.id)
    if (index === -1) return [task, ...current].slice(0, 100)
    const next = [...current]
    next[index] = task
    return next
  })
  const detail = selectedTask()
  if (detail && detail.task.id === task.id) {
    setSelectedTask({ ...detail, task })
  }
}

function applyApproval(approval: Approval): void {
  const detail = selectedTask()
  if (!detail || detail.task.id !== approval.taskID) return
  const approvals = detail.approvals.filter((entry) => entry.id !== approval.id)
  setSelectedTask({
    ...detail,
    approvals: [...approvals, approval].sort((a, b) => a.createdAt - b.createdAt),
  })
}

function handleUpdate(update: TaskUpdate): void {
  if (update.kind === "task.updated" || update.kind === "task.created") {
    applyTask(update.task)
    if (selectedTaskID() === update.taskID) scheduleTaskRefresh(update.taskID)
    if (update.kind === "task.created") void loadTasks()
    return
  }
  if (update.kind === "approval.updated") {
    applyApproval(update.approval)
    scheduleTaskRefresh(update.taskID)
    return
  }
  if (update.kind === "task.event") {
    if (selectedTaskID() !== update.taskID) return
    const text = extractStreamText(update.event)
    if (text) setLiveText((current) => `${current}${text}`)
    if (update.event.seq > 0) {
      setLiveEvents((current) => [...current, update.event].slice(-500))
      scheduleTaskRefresh(update.taskID)
    }
  }
}

export function startEventStream(): () => void {
  return subscribeToEvents(handleUpdate, setStreamState)
}

export async function bootstrap(): Promise<void> {
  setBooting(true)
  setBootError(null)
  await Promise.all([loadSystem(), loadCatalog(), loadWorkspaces(), loadTasks()])
  setBooting(false)
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  const result = await api.updateSettings(patch)
  setCatalog((current) => (current ? { ...current, settings: result.settings } : current))
  setSystem((current) => (current ? { ...current, settings: result.settings } : current))
}

export function upsertWorkspace(workspace: Workspace): void {
  setWorkspaces((current) => [workspace, ...current.filter((entry) => entry.id !== workspace.id)])
}

export function removeWorkspaceLocal(id: string): void {
  setWorkspaces((current) => current.filter((entry) => entry.id !== id))
}

window.addEventListener("hashchange", () => {
  setRoute(parseRoute(window.location.hash))
})
