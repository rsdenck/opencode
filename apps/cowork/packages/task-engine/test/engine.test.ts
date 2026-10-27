import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { CoworkError, EMPTY_USAGE, ID_PREFIXES, newId, type Task } from "@cowork/core"
import type {
  AdapterEvent,
  AgentSummary,
  AssistantMessageSummary,
  CreateSessionInput,
  OpenCodeAdapter,
  ProviderSummary,
  SessionSummary,
} from "@cowork/opencode-adapter"
import { Database, Store } from "@cowork/storage"
import { afterEach, describe, expect, it } from "vitest"
import { TaskEngine, type TaskUpdate } from "../src/index.js"

class FakeAdapter {
  readonly createdSessions: CreateSessionInput[] = []
  readonly prompts: Array<{ sessionID: string; text: string }> = []
  readonly interrupted: string[] = []
  readonly permissionReplies: Array<{
    sessionID: string
    requestID: string
    decision: string
    message?: string
  }> = []
  diffEntries: Array<{ file: string; status: "added" | "modified" | "deleted" }> = []
  messages: AssistantMessageSummary[] = [
    { text: "Final report", reasoning: "", finish: "stop", toolCalls: [] },
    { text: "1. Plan the work", reasoning: "", finish: "stop", toolCalls: [] },
  ]
  providers: ProviderSummary[] = [
    {
      id: "opencode",
      name: "OpenCode",
      models: [
        {
          providerID: "opencode",
          id: "big-pickle",
          name: "Big Pickle",
          contextLimit: 1000,
          outputLimit: 1000,
          status: "active",
          variants: [],
          capabilities: {},
        },
      ],
    },
  ]
  agents: AgentSummary[] = [
    { id: "build", name: "Build", description: null, mode: "primary", hidden: false },
  ]

  private handler: ((event: AdapterEvent) => void | Promise<void>) | null = null

  async health() {
    return {
      connected: true,
      version: "2.1.4",
      pid: 1,
      url: "http://127.0.0.1:4096",
      mode: "explicit" as const,
      error: null,
      checkedAt: Date.now(),
    }
  }

  async subscribe(
    onEvent: (event: AdapterEvent) => void | Promise<void>,
    options: { signal: AbortSignal },
  ): Promise<void> {
    this.handler = onEvent
    await new Promise<void>((resolve) => {
      if (options.signal.aborted) return resolve()
      options.signal.addEventListener("abort", () => resolve(), { once: true })
    })
  }

  async emit(type: string, data: Record<string, unknown>): Promise<void> {
    if (!this.handler) throw new Error("No event handler registered")
    await this.handler({ type, data, raw: null, receivedAt: Date.now() })
  }

  sessionID(event: AdapterEvent): string | undefined {
    return typeof event.data.sessionID === "string" ? event.data.sessionID : undefined
  }

  async listAgents(): Promise<AgentSummary[]> {
    return this.agents
  }

  async listProviders(): Promise<ProviderSummary[]> {
    return this.providers
  }

  async listSkills() {
    return []
  }

  async listMcp() {
    return []
  }

  async createSession(input: CreateSessionInput) {
    this.createdSessions.push(input)
    return {
      id: `ses_${this.createdSessions.length}`,
      projectID: "prj_test",
      directory: input.directory,
      title: input.title,
    } as never
  }

  async prompt(sessionID: string, text: string): Promise<void> {
    this.prompts.push({ sessionID, text })
  }

  async interrupt(sessionID: string): Promise<void> {
    this.interrupted.push(sessionID)
  }

  async replyPermission(
    sessionID: string,
    requestID: string,
    decision: string,
    message?: string,
  ): Promise<void> {
    this.permissionReplies.push({ sessionID, requestID, decision, message })
  }

  async getSession(sessionID: string): Promise<SessionSummary> {
    return {
      id: sessionID,
      projectID: "prj_test",
      outcome: "success",
      cost: 0.0042,
      tokens: { ...EMPTY_USAGE, input: 120, output: 80 },
    }
  }

  async getMessages(): Promise<AssistantMessageSummary[]> {
    return this.messages
  }

  async getDiff() {
    return this.diffEntries
  }

  async diagnostics() {
    return { ok: true }
  }
}

interface Harness {
  engine: TaskEngine
  store: Store
  adapter: FakeAdapter
  dir: string
  workspace: string
  updates: TaskUpdate[]
}

const harnesses: Harness[] = []

async function createHarness(options: { allowedWorkspaceRoots?: string[] } = {}): Promise<Harness> {
  const dir = mkdtempSync(join(tmpdir(), "cowork-engine-"))
  const workspace = join(dir, "workspace")
  mkdirSync(workspace)
  writeFileSync(join(workspace, "README.md"), "# test\n")
  const store = new Store(new Database(join(dir, "cowork.db")))
  const adapter = new FakeAdapter()
  const engine = new TaskEngine({
    store,
    adapter: adapter as unknown as OpenCodeAdapter,
    allowedWorkspaceRoots: options.allowedWorkspaceRoots,
    maxSnapshotFiles: 100,
  })
  const updates: TaskUpdate[] = []
  engine.subscribe((update) => updates.push(update))
  await engine.start()
  const harness = { engine, store, adapter, dir, workspace, updates }
  harnesses.push(harness)
  return harness
}

async function registerWorkspace(harness: Harness) {
  return harness.engine.addWorkspace({ path: harness.workspace, name: "Test workspace" })
}

async function waitFor<T>(fn: () => T | null | undefined | false, timeout = 5000): Promise<T> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeout) {
    const value = fn()
    if (value) return value as T
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error("Timed out waiting for condition")
}

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  try {
    await promise
    expect.unreachable(`Expected ${code}`)
  } catch (error) {
    expect(error).toBeInstanceOf(CoworkError)
    expect((error as CoworkError).code).toBe(code)
  }
}

afterEach(async () => {
  for (const harness of harnesses.splice(0)) {
    await harness.engine.stop()
    harness.store.close()
    rmSync(harness.dir, { recursive: true, force: true })
  }
})

describe("task creation", () => {
  it("creates a workspace-scoped task, session and five lifecycle steps", async () => {
    const harness = await createHarness()
    const workspace = await registerWorkspace(harness)
    const task = await harness.engine.createTask({
      workspaceID: workspace.id,
      prompt: "Create a report\nwith details",
      model: { providerID: "opencode", id: "big-pickle" },
    })

    expect(task.title).toBe("Create a report")
    expect(task.status).toBe("queued")
    const running = await waitFor(() => {
      const stored = harness.store.tasks.get(task.id)
      return stored?.status === "running" ? stored : null
    })
    expect(running.sessionID).toBe("ses_1")
    expect(running.startedAt).toBeTypeOf("number")

    expect(harness.adapter.createdSessions).toHaveLength(1)
    expect(harness.adapter.createdSessions[0]?.approvalMode).toBe("ask")
    expect(harness.adapter.prompts[0]?.text).toContain("BEGIN USER REQUEST")
    expect(harness.adapter.prompts[0]?.text).toContain("Create a report\nwith details")

    const steps = harness.store.steps.listByTask(task.id)
    expect(steps.map((step) => step.phase)).toEqual([
      "prepare",
      "analyze",
      "execute",
      "verify",
      "finalize",
    ])
    expect(steps.find((step) => step.phase === "prepare")?.status).toBe("completed")
    expect(steps.find((step) => step.phase === "analyze")?.status).toBe("running")
    expect(harness.updates.some((update) => update.kind === "task.created")).toBe(true)
  })

  it("rejects unknown models and agents before persisting a task", async () => {
    const harness = await createHarness()
    const workspace = await registerWorkspace(harness)

    await expectCode(
      harness.engine.createTask({
        workspaceID: workspace.id,
        prompt: "Do it",
        model: { providerID: "opencode", id: "missing" },
      }),
      "model_not_found",
    )
    await expectCode(
      harness.engine.createTask({
        workspaceID: workspace.id,
        prompt: "Do it",
        model: { providerID: "nope", id: "big-pickle" },
      }),
      "model_provider_not_found",
    )
    await expectCode(
      harness.engine.createTask({
        workspaceID: workspace.id,
        prompt: "Do it",
        model: { providerID: "opencode", id: "big-pickle" },
        agent: "hidden",
      }),
      "agent_not_found",
    )
    expect(harness.store.tasks.list({ limit: 10, offset: 0 }).total).toBe(0)
  })

  it("rejects workspace paths outside the configured allowed roots", async () => {
    const harness = await createHarness({ allowedWorkspaceRoots: ["/definitely/not/here"] })
    await expectCode(registerWorkspace(harness), "workspace_root_not_allowed")
  })
})

describe("approvals", () => {
  it("pauses on permission.asked and resumes after an approval reply", async () => {
    const harness = await createHarness()
    const workspace = await registerWorkspace(harness)
    const task = await harness.engine.createTask({
      workspaceID: workspace.id,
      prompt: "Edit a file",
      model: { providerID: "opencode", id: "big-pickle" },
    })
    const running = await waitFor(() => {
      const stored = harness.store.tasks.get(task.id)
      return stored?.status === "running" ? stored : null
    })

    await harness.adapter.emit("permission.asked", {
      id: "perm_1",
      sessionID: running.sessionID,
      action: "edit",
      resources: [join(harness.workspace, "README.md")],
      metadata: { diff: "+hello" },
    })

    const paused = await waitFor(() => {
      const stored = harness.store.tasks.get(task.id)
      return stored?.status === "awaiting_approval" ? stored : null
    })
    expect(paused.status).toBe("awaiting_approval")
    const pending = await harness.engine.getPendingApprovals()
    expect(pending).toHaveLength(1)
    expect(pending[0]?.action).toBe("edit")

    const first = pending[0]
    if (!first) throw new Error("Expected a pending approval")
    const approval = await harness.engine.replyApproval(first.id, "once", "go ahead")
    expect(approval.status).toBe("approved")
    expect(harness.adapter.permissionReplies).toEqual([
      { sessionID: "ses_1", requestID: "perm_1", decision: "once", message: "go ahead" },
    ])
    expect(harness.store.tasks.get(task.id)?.status).toBe("running")

    await expectCode(harness.engine.replyApproval(approval.id, "once"), "approval_already_resolved")
  })

  it("handles duplicate permission events idempotently", async () => {
    const harness = await createHarness()
    const workspace = await registerWorkspace(harness)
    const task = await harness.engine.createTask({
      workspaceID: workspace.id,
      prompt: "Edit",
      model: { providerID: "opencode", id: "big-pickle" },
    })
    const running = await waitFor(() => {
      const stored = harness.store.tasks.get(task.id)
      return stored?.status === "running" ? stored : null
    })
    const event = {
      id: "perm_dup",
      sessionID: running.sessionID,
      action: "write",
      resources: [],
      metadata: null,
    }
    await harness.adapter.emit("permission.asked", event)
    await harness.adapter.emit("permission.asked", event)
    expect(harness.store.approvals.listByTask(task.id)).toHaveLength(1)
    expect(harness.store.tasks.get(task.id)?.status).toBe("awaiting_approval")
  })
})

describe("completion and artifacts", () => {
  it("completes with the newest assistant message as the final report", async () => {
    const harness = await createHarness()
    const workspace = await registerWorkspace(harness)
    writeFileSync(join(harness.workspace, "result.txt"), "created by the task")
    harness.adapter.diffEntries = [{ file: "result.txt", status: "added" }]
    const task = await harness.engine.createTask({
      workspaceID: workspace.id,
      prompt: "Write a result file",
      model: { providerID: "opencode", id: "big-pickle" },
    })
    const running = await waitFor(() => {
      const stored = harness.store.tasks.get(task.id)
      return stored?.status === "running" ? stored : null
    })

    await harness.adapter.emit("session.execution.succeeded", { sessionID: running.sessionID })

    const completed = await waitFor(() => {
      const stored = harness.store.tasks.get(task.id)
      return stored?.status === "completed" ? stored : null
    })
    expect(completed.summary).toBe("Final report")
    expect(completed.planSummary).toBe("1. Plan the work")
    expect(completed.cost).toBe(0.0042)
    expect(completed.tokens.input).toBe(120)
    expect(completed.resumable).toBe(false)

    const artifacts = harness.store.artifacts.listByTask(task.id)
    expect(artifacts).toHaveLength(1)
    expect(artifacts[0]).toMatchObject({ path: "result.txt", change: "created", size: 19 })
    const finalSteps = harness.store.steps.listByTask(task.id)
    expect(
      finalSteps.every((step) => step.status === "completed" || step.status === "skipped"),
    ).toBe(true)
    expect(finalSteps.some((step) => step.status === "completed")).toBe(true)
    expect(
      harness.store.events.list(task.id, 100).some((event) => event.type === "task.completed"),
    ).toBe(true)
  })

  it("marks the task failed when OpenCode reports an execution failure", async () => {
    const harness = await createHarness()
    const workspace = await registerWorkspace(harness)
    const task = await harness.engine.createTask({
      workspaceID: workspace.id,
      prompt: "Fail",
      model: { providerID: "opencode", id: "big-pickle" },
    })
    const running = await waitFor(() => {
      const stored = harness.store.tasks.get(task.id)
      return stored?.status === "running" ? stored : null
    })
    await harness.adapter.emit("session.execution.failed", {
      sessionID: running.sessionID,
      error: { message: "provider exploded with token sk-secret-value" },
    })
    const failed = await waitFor(() => {
      const stored = harness.store.tasks.get(task.id)
      return stored?.status === "failed" ? stored : null
    })
    expect(failed.error).toContain("provider exploded")
    expect(failed.error).not.toContain("sk-secret-value")
    expect(failed.resumable).toBe(true)
  })
})

describe("cancellation and resumption", () => {
  it("cancels a running task and interrupts the OpenCode session", async () => {
    const harness = await createHarness()
    const workspace = await registerWorkspace(harness)
    const task = await harness.engine.createTask({
      workspaceID: workspace.id,
      prompt: "Long running",
      model: { providerID: "opencode", id: "big-pickle" },
    })
    const running = await waitFor(() => {
      const stored = harness.store.tasks.get(task.id)
      return stored?.status === "running" ? stored : null
    })

    await harness.adapter.emit("permission.asked", {
      id: "perm_cancel",
      sessionID: running.sessionID,
      action: "edit",
      resources: [],
      metadata: null,
    })
    await waitFor(() => {
      const stored = harness.store.tasks.get(task.id)
      return stored?.status === "awaiting_approval" ? stored : null
    })

    const cancelled = await harness.engine.cancelTask(task.id)
    expect(cancelled.status).toBe("cancelled")
    expect(harness.adapter.interrupted).toEqual(["ses_1"])
    await expectCode(harness.engine.cancelTask(task.id), "task_already_finished")
    expect(harness.store.steps.listByTask(task.id).every((step) => step.status !== "running")).toBe(
      true,
    )
    expect(
      harness.store.approvals.listByTask(task.id).every((entry) => entry.status === "expired"),
    ).toBe(true)

    // Late events from the upstream stream must not resurrect a cancelled task.
    await harness.adapter.emit("session.step.started", { sessionID: running.sessionID })
    await harness.adapter.emit("session.execution.succeeded", { sessionID: running.sessionID })
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(harness.store.tasks.get(task.id)?.status).toBe("cancelled")
    expect(harness.store.steps.listByTask(task.id).some((step) => step.status === "running")).toBe(
      false,
    )
  })

  it("marks a task interrupted and resumes it by prompting the existing session", async () => {
    const harness = await createHarness()
    const workspace = await registerWorkspace(harness)
    const task = await harness.engine.createTask({
      workspaceID: workspace.id,
      prompt: "Finish later",
      model: { providerID: "opencode", id: "big-pickle" },
    })
    const running = await waitFor(() => {
      const stored = harness.store.tasks.get(task.id)
      return stored?.status === "running" ? stored : null
    })

    await harness.adapter.emit("session.execution.interrupted", {
      sessionID: running.sessionID,
    })
    const interrupted = await waitFor(() => {
      const stored = harness.store.tasks.get(task.id)
      return stored?.status === "interrupted" ? stored : null
    })
    expect(interrupted.resumable).toBe(true)

    const resumed = await harness.engine.resumeTask(task.id)
    expect(resumed.status).toBe("running")
    expect(harness.adapter.prompts).toHaveLength(2)
    expect(harness.adapter.prompts[1]?.text).toContain("This task was interrupted")
    expect(harness.adapter.createdSessions).toHaveLength(1)
  })

  it("creates a replacement session when the original session is gone", async () => {
    const harness = await createHarness()
    const workspace = await registerWorkspace(harness)
    const task = await harness.engine.createTask({
      workspaceID: workspace.id,
      prompt: "Resume me",
      model: { providerID: "opencode", id: "big-pickle" },
    })
    await waitFor(() => {
      const stored = harness.store.tasks.get(task.id)
      return stored?.status === "running" ? stored : null
    })
    harness.store.tasks.setStatus(task.id, "failed", {
      error: "boom",
      resumable: true,
    })
    harness.adapter.getSession = async () => {
      throw new Error("session not found")
    }

    const resumed = await harness.engine.resumeTask(task.id)
    expect(resumed.status).toBe("running")
    expect(harness.adapter.createdSessions).toHaveLength(2)
    expect(harness.adapter.createdSessions[1]?.title).toContain("Resume me")
  })

  it("refuses to resume a task that is not interrupted or failed", async () => {
    const harness = await createHarness()
    const workspace = await registerWorkspace(harness)
    const task = await harness.engine.createTask({
      workspaceID: workspace.id,
      prompt: "Working",
      model: { providerID: "opencode", id: "big-pickle" },
    })
    await waitFor(() => {
      const stored = harness.store.tasks.get(task.id)
      return stored?.status === "running" ? stored : null
    })
    await expectCode(harness.engine.resumeTask(task.id), "task_not_resumable")
  })
})

describe("restart recovery", () => {
  it("marks active tasks as interrupted and expires pending approvals", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cowork-recovery-"))
    const workspacePath = join(dir, "workspace")
    mkdirSync(workspacePath)
    const store = new Store(new Database(join(dir, "cowork.db")))
    const workspace = store.workspaces.create({ name: "Recovery", path: workspacePath })
    const now = Date.now()
    const task: Task = {
      id: newId(ID_PREFIXES.task),
      title: "Interrupted task",
      prompt: "p",
      workspaceID: workspace.id,
      workspacePath,
      sessionID: "ses_stale",
      status: "running",
      phase: "execute",
      model: null,
      agent: "build",
      approvalMode: "ask",
      createdAt: now,
      updatedAt: now,
      startedAt: now,
      finishedAt: null,
      error: null,
      summary: null,
      planSummary: null,
      cost: 0,
      tokens: { ...EMPTY_USAGE },
      resumable: false,
    }
    store.tasks.insert(task)
    store.steps.create({
      taskID: task.id,
      phase: "execute",
      title: "Execute",
      ordinal: 0,
      status: "running",
    })
    store.approvals.create({
      taskID: task.id,
      requestID: "perm_stale",
      action: "edit",
      resources: [],
      metadata: null,
    })

    const adapter = new FakeAdapter()
    const engine = new TaskEngine({ store, adapter: adapter as unknown as OpenCodeAdapter })
    await engine.start()

    const recovered = store.tasks.get(task.id)
    expect(recovered?.status).toBe("interrupted")
    expect(recovered?.resumable).toBe(true)
    expect(recovered?.error).toBe("cowork_restarted")
    expect(store.steps.listByTask(task.id)[0]?.status).toBe("failed")
    expect(store.approvals.listPending()).toHaveLength(0)
    expect(store.events.list(task.id, 100).some((event) => event.type === "task.status")).toBe(true)

    await engine.stop()
    store.close()
    rmSync(dir, { recursive: true, force: true })
  })
})
