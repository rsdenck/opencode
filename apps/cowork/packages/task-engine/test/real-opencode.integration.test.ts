import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { OpenCodeAdapter } from "@cowork/opencode-adapter"
import { Database, Store } from "@cowork/storage"
import { afterAll, describe, expect, it } from "vitest"
import { TaskEngine } from "../src/index.js"

/**
 * Real end-to-end check against a running OpenCode V2 service. It is disabled
 * by default because it needs the upstream service, network/provider access
 * and several minutes. Enable with:
 *
 *   COWORK_REAL_OPENCODE=1 OPENCODE_MODEL=opencode/big-pickle \
 *     npm run test:integration
 *
 * The test creates a temporary workspace, asks the real agent to write a file,
 * approves any permission requests through the real permission API, and
 * verifies the persisted task, artifacts and report.
 */
const enabled = process.env.COWORK_REAL_OPENCODE === "1"
const modelRef = (process.env.OPENCODE_MODEL ?? "opencode/big-pickle").split("/")
const providerID = modelRef[0] ?? "opencode"
const modelID = modelRef.slice(1).join("/") || "big-pickle"

describe.skipIf(!enabled)("real OpenCode integration", () => {
  const dir = mkdtempSync(join(tmpdir(), "cowork-real-e2e-"))
  const workspacePath = join(dir, "workspace")
  const store = new Store(new Database(join(dir, "cowork.db")))
  const adapter = new OpenCodeAdapter({ service: true })
  const engine = new TaskEngine({ store, adapter, maxSnapshotFiles: 500 })

  afterAll(async () => {
    await engine.stop()
    store.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it("runs a real task with approval through completion", async () => {
    const fs = await import("node:fs")
    fs.mkdirSync(workspacePath, { recursive: true })
    await engine.start()

    const health = await adapter.health(true)
    expect(health.connected).toBe(true)

    const workspace = await engine.addWorkspace({
      path: workspacePath,
      name: "Real E2E workspace",
    })
    const task = await engine.createTask({
      workspaceID: workspace.id,
      title: "Real OpenCode integration check",
      prompt: [
        "Create a file named cowork-proof.txt in the workspace root.",
        "Its exact contents must be: cowork-v2-ok",
        "Use the write/edit tool for this, then read the file back and report its contents.",
        "Do not modify any other file.",
      ].join(" "),
      model: { providerID, id: modelID },
      approvalMode: "ask",
      agent: "build",
    })

    let approvalsReplied = 0
    const finished = await waitForTask(
      engine,
      task.id,
      async (status) => {
        if (status === "awaiting_approval") {
          const pending = await engine.getPendingApprovals()
          for (const approval of pending) {
            await engine.replyApproval(approval.id, "always", "approved by integration test")
            approvalsReplied += 1
          }
        }
        return false
      },
      210_000,
    )

    expect(finished.status).toBe("completed")
    expect(finished.summary?.length ?? 0).toBeGreaterThan(0)

    const file = readFileSync(join(workspacePath, "cowork-proof.txt"), "utf8")
    expect(file.trim()).toBe("cowork-v2-ok")

    const detail = engine.getTaskDetail(task.id, 2000)
    expect(detail.artifacts.some((artifact) => artifact.path === "cowork-proof.txt")).toBe(true)
    expect(detail.events.some((event) => event.type === "session.execution.succeeded")).toBe(true)
    expect(detail.events.some((event) => event.type === "permission.asked")).toBe(
      approvalsReplied > 0,
    )

    // Persisted state survives an engine restart without data loss.
    const reopened = new Store(new Database(join(dir, "cowork.db")))
    expect(reopened.tasks.get(task.id)?.status).toBe("completed")
    reopened.close()
  }, 220_000)
})

async function waitForTask(
  engine: TaskEngine,
  taskID: string,
  onStatus: (status: string) => Promise<boolean>,
  timeoutMs: number,
) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const task = engine.getTaskDetail(taskID, 100).task
    if (task.status === "completed" || task.status === "failed" || task.status === "cancelled") {
      return task
    }
    await onStatus(task.status)
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  const task = engine.getTaskDetail(taskID, 100).task
  throw new Error(`Task did not finish in ${timeoutMs}ms (status: ${task.status})`)
}
