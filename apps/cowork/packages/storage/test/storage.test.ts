import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { EMPTY_USAGE, ID_PREFIXES, newId, type Task, type TaskStatus } from "@cowork/core"
import { afterEach, describe, expect, it } from "vitest"
import { Database, Store } from "../src/index.js"

const directories: string[] = []
const stores: Store[] = []

function makeStore(): { store: Store; file: string; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "cowork-storage-"))
  directories.push(dir)
  const file = join(dir, "test.db")
  const store = new Store(new Database(file))
  stores.push(store)
  return { store, file, dir }
}

function makeTask(overrides: Partial<Task> = {}): Task {
  const now = Date.now()
  return {
    id: newId(ID_PREFIXES.task),
    title: "Test task",
    prompt: "Do the thing",
    workspaceID: "wsp_missing",
    workspacePath: "/tmp/workspace",
    sessionID: null,
    status: "queued",
    phase: "prepare",
    model: null,
    agent: "build",
    approvalMode: "ask",
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    finishedAt: null,
    error: null,
    summary: null,
    planSummary: null,
    cost: 0,
    tokens: { ...EMPTY_USAGE },
    resumable: false,
    ...overrides,
  }
}

afterEach(() => {
  for (const store of stores.splice(0)) {
    try {
      store.close()
    } catch {
      // Already closed by the test.
    }
  }
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe("migrations", () => {
  it("applies all migrations atomically and reports the schema version", () => {
    const { store } = makeStore()
    expect(store.db.schemaVersion).toBe(3)
    const tables = store.db.raw
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as Array<{ name: string }>
    const names = tables.map((row) => row.name)
    expect(names).toEqual(
      expect.arrayContaining([
        "approvals",
        "artifacts",
        "settings",
        "task_events",
        "task_steps",
        "tasks",
        "workspaces",
      ]),
    )
  })

  it("is idempotent when reopening an existing database", () => {
    const { store, file } = makeStore()
    store.close()
    const reopened = new Store(new Database(file))
    stores.push(reopened)
    expect(reopened.db.schemaVersion).toBe(3)
  })
})

describe("workspace repository", () => {
  it("creates, finds, lists, touches and removes workspaces", () => {
    const { store } = makeStore()
    const workspace = store.workspaces.create({ name: "Project", path: "/tmp/project" })
    expect(workspace.id).toMatch(/^wsp_/)
    expect(store.workspaces.get(workspace.id)?.name).toBe("Project")
    expect(store.workspaces.findByPath("/tmp/project")?.id).toBe(workspace.id)
    expect(store.workspaces.list()).toHaveLength(1)

    store.workspaces.touch(workspace.id, 1234)
    expect(store.workspaces.get(workspace.id)?.lastUsedAt).toBe(1234)
    expect(store.workspaces.remove(workspace.id)).toBe(true)
    expect(store.workspaces.get(workspace.id)).toBeNull()
  })

  it("enforces unique workspace paths", () => {
    const { store } = makeStore()
    store.workspaces.create({ name: "A", path: "/tmp/project" })
    expect(() => store.workspaces.create({ name: "B", path: "/tmp/project" })).toThrow()
  })
})

describe("task repository", () => {
  it("round-trips every task field and applies patches", () => {
    const { store } = makeStore()
    const workspace = store.workspaces.create({ name: "W", path: "/tmp/w" })
    const task = makeTask({
      workspaceID: workspace.id,
      workspacePath: workspace.path,
      model: { providerID: "opencode", id: "big-pickle" },
      status: "running",
      phase: "execute",
      startedAt: 100,
      cost: 0.25,
      tokens: { ...EMPTY_USAGE, input: 10, output: 20 },
    })
    store.tasks.insert(task)
    const loaded = store.tasks.get(task.id)
    expect(loaded).toEqual(task)
    expect(loaded?.model).toEqual({ providerID: "opencode", id: "big-pickle" })

    const updated = store.tasks.update(task.id, {
      status: "completed",
      summary: "Done",
      planSummary: "Plan",
      finishedAt: 200,
      resumable: false,
    })
    expect(updated?.status).toBe("completed")
    expect(updated?.summary).toBe("Done")
    expect(updated?.planSummary).toBe("Plan")
    expect(updated?.finishedAt).toBe(200)
    expect(store.tasks.getBySession("ses_unknown")).toBeNull()
  })

  it("filters, paginates and counts active tasks", () => {
    const { store } = makeStore()
    const workspace = store.workspaces.create({ name: "W", path: "/tmp/w" })
    for (const status of ["queued", "running", "completed", "failed"] as TaskStatus[]) {
      store.tasks.insert(
        makeTask({
          id: newId(ID_PREFIXES.task),
          workspaceID: workspace.id,
          workspacePath: workspace.path,
          status,
        }),
      )
    }
    expect(store.tasks.list({ limit: 50, offset: 0 }).total).toBe(4)
    expect(store.tasks.list({ limit: 50, offset: 0, status: "running" }).items).toHaveLength(1)
    expect(store.tasks.list({ limit: 50, offset: 0, workspaceID: workspace.id }).total).toBe(4)
    expect(store.tasks.list({ limit: 2, offset: 0 }).items).toHaveLength(2)
    expect(store.tasks.countActive()).toBe(2)
  })

  it("marks active tasks as interrupted after restart", () => {
    const { store } = makeStore()
    const workspace = store.workspaces.create({ name: "W", path: "/tmp/w" })
    const active = makeTask({
      workspaceID: workspace.id,
      workspacePath: workspace.path,
      status: "running",
    })
    const done = makeTask({
      workspaceID: workspace.id,
      workspacePath: workspace.path,
      status: "completed",
    })
    store.tasks.insert(active)
    store.tasks.insert(done)

    const interrupted = store.tasks.markActiveAsInterrupted("cowork_restarted")
    expect(interrupted).toHaveLength(1)
    expect(store.tasks.get(active.id)?.status).toBe("interrupted")
    expect(store.tasks.get(active.id)?.resumable).toBe(true)
    expect(store.tasks.get(done.id)?.status).toBe("completed")
  })

  it("enforces workspace foreign keys", () => {
    const { store } = makeStore()
    expect(() => store.tasks.insert(makeTask({ workspaceID: "wsp_missing" }))).toThrow()
  })
})

describe("steps and events", () => {
  it("tracks step lifecycle transitions", () => {
    const { store } = makeStore()
    const workspace = store.workspaces.create({ name: "W", path: "/tmp/w" })
    const task = makeTask({ workspaceID: workspace.id, workspacePath: workspace.path })
    store.tasks.insert(task)
    const step = store.steps.create({
      taskID: task.id,
      phase: "prepare",
      title: "Prepare",
      ordinal: 0,
      status: "running",
    })
    expect(store.steps.listByTask(task.id)).toHaveLength(1)
    store.steps.markRunningAsCompleted(task.id, 50)
    expect(store.steps.get(step.id)?.status).toBe("completed")
    store.steps.create({ taskID: task.id, phase: "execute", title: "Execute", ordinal: 1 })
    store.steps.markPendingAsSkipped(task.id, 60)
    expect(store.steps.listByTask(task.id)[1]?.status).toBe("skipped")
  })

  it("assigns monotonically increasing per-task event sequences", () => {
    const { store } = makeStore()
    const workspace = store.workspaces.create({ name: "W", path: "/tmp/w" })
    const first = makeTask({ id: "tsk_one", workspaceID: workspace.id, workspacePath: "/tmp/w" })
    const second = makeTask({ id: "tsk_two", workspaceID: workspace.id, workspacePath: "/tmp/w" })
    store.tasks.insert(first)
    store.tasks.insert(second)

    const events = Array.from({ length: 25 }, (_, index) =>
      store.events.append(first.id, "test.event", { index }),
    )
    expect(events.map((event) => event.seq)).toEqual(
      Array.from({ length: 25 }, (_, index) => index + 1),
    )
    expect(store.events.append(second.id, "test.event", {}).seq).toBe(1)
    expect(store.events.count(first.id)).toBe(25)
    const page = store.events.list(first.id, 10)
    expect(page).toHaveLength(10)
    expect(page.at(-1)?.seq).toBe(25)
  })
})

describe("approvals and artifacts", () => {
  it("creates approvals idempotently and resolves them once", () => {
    const { store } = makeStore()
    const workspace = store.workspaces.create({ name: "W", path: "/tmp/w" })
    const task = makeTask({ workspaceID: workspace.id, workspacePath: "/tmp/w" })
    store.tasks.insert(task)

    const first = store.approvals.create({
      taskID: task.id,
      requestID: "perm_1",
      action: "edit",
      resources: ["/tmp/w/a.txt"],
      metadata: { diff: "+hello" },
    })
    const duplicate = store.approvals.create({
      taskID: task.id,
      requestID: "perm_1",
      action: "edit",
      resources: [],
      metadata: null,
    })
    expect(duplicate.id).toBe(first.id)
    expect(store.approvals.listPending()).toHaveLength(1)

    const resolved = store.approvals.resolve(first.id, {
      status: "approved",
      decision: "once",
      message: "go ahead",
    })
    expect(resolved?.status).toBe("approved")
    expect(resolved?.resolvedAt).toBeTypeOf("number")
    store.approvals.resolve(first.id, { status: "rejected", decision: "reject" })
    expect(store.approvals.get(first.id)?.status).toBe("approved")
    expect(store.approvals.expirePending()).toBe(0)
  })

  it("expires pending approvals and replaces artifact sets", () => {
    const { store } = makeStore()
    const workspace = store.workspaces.create({ name: "W", path: "/tmp/w" })
    const task = makeTask({ workspaceID: workspace.id, workspacePath: "/tmp/w" })
    store.tasks.insert(task)
    store.approvals.create({
      taskID: task.id,
      requestID: "perm_pending",
      action: "shell",
      resources: [],
      metadata: null,
    })
    expect(store.approvals.expirePending()).toBe(1)
    expect(store.approvals.listPending()).toHaveLength(0)

    const inserted = store.artifacts.replaceForTask(task.id, [
      { path: "a.txt", change: "created", size: 4, mtime: 1 },
      { path: "b.txt", change: "modified", size: 9, mtime: 2 },
    ])
    expect(inserted).toHaveLength(2)
    expect(store.artifacts.listByTask(task.id).map((artifact) => artifact.path)).toEqual([
      "a.txt",
      "b.txt",
    ])
    store.artifacts.replaceForTask(task.id, [
      { path: "c.txt", change: "deleted", size: 0, mtime: 3 },
    ])
    expect(store.artifacts.listByTask(task.id)).toHaveLength(1)
  })
})

describe("settings", () => {
  it("stores JSON values and upserts keys", () => {
    const { store } = makeStore()
    store.settings.setMany({
      defaultAgent: "build",
      defaultModel: { providerID: "opencode", id: "big-pickle" },
      taskRetentionDays: 90,
    })
    expect(store.settings.getAll()).toEqual({
      defaultAgent: "build",
      defaultModel: { providerID: "opencode", id: "big-pickle" },
      taskRetentionDays: 90,
    })
    store.settings.set("defaultAgent", "plan")
    expect(store.settings.getAll().defaultAgent).toBe("plan")
  })
})
