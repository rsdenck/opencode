import { createEffect, createSignal, For, Show } from "solid-js"
import { api } from "../api"
import { ApprovalCard } from "../components/ApprovalCard"
import { ArtifactTable } from "../components/ArtifactTable"
import { EventList } from "../components/EventList"
import { FilePreview } from "../components/FileBrowser"
import { Icon } from "../components/Icons"
import { StatusBadge } from "../components/StatusBadge"
import { Timeline } from "../components/Timeline"
import {
  errorMessage,
  liveEvents,
  liveText,
  loadTask,
  navigate,
  notify,
  route,
  selectedTask,
} from "../store"
import type { Approval, AssistantMessage, Decision, TaskEvent } from "../types"
import {
  formatCost,
  formatDateTime,
  formatDuration,
  formatRelative,
  formatTokens,
  isTerminal,
  modelLabel,
  PHASE_LABELS,
} from "../utils"

function buildEventList(persisted: TaskEvent[], live: TaskEvent[], taskID: string): TaskEvent[] {
  const map = new Map<string, TaskEvent>()
  for (const event of persisted) map.set(event.id, event)
  for (const event of live) {
    if (event.taskID === taskID && event.seq > 0) map.set(event.id, event)
  }
  return [...map.values()].sort((a, b) => a.createdAt - b.createdAt || a.seq - b.seq)
}

export function TaskDetailView() {
  const [messages, setMessages] = createSignal<AssistantMessage[]>([])
  const [messagesLoading, setMessagesLoading] = createSignal(false)
  const [messagesError, setMessagesError] = createSignal<string | null>(null)
  const [previewPath, setPreviewPath] = createSignal<string | null>(null)
  const [busy, setBusy] = createSignal<string | null>(null)
  let messagesKey = ""

  const taskID = () => {
    const current = route()
    return current.name === "task" ? current.id : null
  }

  const detail = () => {
    const current = selectedTask()
    return current && current.task.id === taskID() ? current : null
  }

  const task = () => detail()?.task ?? null

  createEffect(() => {
    const id = taskID()
    if (id) void loadTask(id)
  })

  const loadMessages = async () => {
    const id = taskID()
    if (!id) return
    setMessagesLoading(true)
    setMessagesError(null)
    try {
      const result = await api.listMessages(id)
      setMessages(result.messages)
    } catch (caught) {
      setMessagesError(errorMessage(caught))
    } finally {
      setMessagesLoading(false)
    }
  }

  createEffect(() => {
    const current = detail()
    if (!current?.task.sessionID) {
      setMessages([])
      return
    }
    const status = current.task.status
    if (status !== "completed" && status !== "failed" && status !== "cancelled") return
    const key = `${current.task.id}:${status}`
    if (messagesKey === key) return
    messagesKey = key
    void loadMessages()
  })

  const mergedEvents = () => {
    const current = detail()
    if (!current) return []
    return buildEventList(current.events, liveEvents(), current.task.id)
  }

  const pendingApprovals = () =>
    detail()?.approvals.filter((item) => item.status === "pending") ?? []
  const resolvedApprovals = () =>
    detail()?.approvals.filter((item) => item.status !== "pending") ?? []

  const replyApproval = async (approval: Approval, decision: Decision, message?: string) => {
    await api.replyApproval(approval.id, decision, message)
    notify(decision === "reject" ? "Request rejected." : "Request approved.")
    if (taskID()) await loadTask(taskID() as string)
  }

  const cancel = async () => {
    const current = task()
    if (!current) return
    if (
      !window.confirm(
        "Cancel this task? The OpenCode session will be interrupted and unfinished steps marked as failed.",
      )
    ) {
      return
    }
    setBusy("cancel")
    try {
      await api.cancelTask(current.id)
      notify("Cancellation requested.")
      await loadTask(current.id)
    } catch (caught) {
      notify(errorMessage(caught), "error")
    } finally {
      setBusy(null)
    }
  }

  const resume = async () => {
    const current = task()
    if (!current) return
    setBusy("resume")
    try {
      await api.resumeTask(current.id)
      notify("Task resumed in its OpenCode session.")
      await loadTask(current.id)
    } catch (caught) {
      notify(errorMessage(caught), "error")
    } finally {
      setBusy(null)
    }
  }

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value)
      notify(`${label} copied.`)
    } catch {
      notify("Could not copy to the clipboard.", "error")
    }
  }

  const active = () => {
    const status = task()?.status
    return Boolean(status && !isTerminal(status) && status !== "interrupted")
  }

  return (
    <div class="page">
      <Show
        when={taskID()}
        fallback={
          <div class="empty">
            <Icon name="tasks" size={30} />
            <p>No task selected.</p>
            <a class="button subtle" href="#/tasks">
              Back to tasks
            </a>
          </div>
        }
      >
        <Show
          when={detail()}
          fallback={
            <div class="panel">
              <div class="panel-body">
                <p class="muted">Loading task…</p>
              </div>
            </div>
          }
        >
          {(current) => (
            <>
              <header class="page-header detail-header">
                <div>
                  <button
                    type="button"
                    class="link-button back-link"
                    onClick={() => navigate("/tasks")}
                  >
                    <Icon name="arrowLeft" size={15} />
                    Tasks
                  </button>
                  <div class="detail-title-row">
                    <h1 class="page-title">{current().task.title}</h1>
                    <StatusBadge status={current().task.status} />
                  </div>
                  <p class="page-subtitle">
                    {current().task.workspacePath} · {modelLabel(current().task)} ·{" "}
                    {current().task.agent} · created {formatRelative(current().task.createdAt)}
                  </p>
                </div>
                <div class="actions">
                  <button
                    type="button"
                    class="button subtle"
                    onClick={() => void loadTask(current().task.id)}
                  >
                    <Icon name="refresh" size={16} />
                    Refresh
                  </button>
                  <Show when={current().task.resumable && !isTerminal(current().task.status)}>
                    <button
                      type="button"
                      class="button primary"
                      disabled={busy() !== null}
                      onClick={() => void resume()}
                    >
                      <Icon name="play" size={15} />
                      {busy() === "resume" ? "Resuming…" : "Resume"}
                    </button>
                  </Show>
                  <Show when={!isTerminal(current().task.status)}>
                    <button
                      type="button"
                      class="button danger"
                      disabled={busy() !== null}
                      onClick={() => void cancel()}
                    >
                      <Icon name="stop" size={15} />
                      {busy() === "cancel" ? "Cancelling…" : "Cancel"}
                    </button>
                  </Show>
                  <Show when={current().task.status === "failed" && current().task.resumable}>
                    <button
                      type="button"
                      class="button primary"
                      disabled={busy() !== null}
                      onClick={() => void resume()}
                    >
                      <Icon name="refresh" size={15} />
                      {busy() === "resume" ? "Resuming…" : "Retry task"}
                    </button>
                  </Show>
                </div>
              </header>

              <div class="detail-chips">
                <span class="pill">
                  <Icon name="activity" size={13} />
                  {PHASE_LABELS[current().task.phase] ?? current().task.phase}
                </span>
                <span class="pill">
                  <Icon name="clock" size={13} />
                  {formatDuration(current().task.startedAt, current().task.finishedAt)}
                </span>
                <span class="pill">
                  <Icon name="cpu" size={13} />
                  {formatTokens(current().task.tokens)} · {formatCost(current().task.cost)}
                </span>
                <span class="pill">
                  <Icon name="shield" size={13} />
                  Approvals: {current().task.approvalMode}
                </span>
                <Show when={current().workspace}>
                  <span class="pill" title={current().workspace?.path}>
                    <Icon name="folder" size={13} />
                    {current().workspace?.name}
                  </span>
                </Show>
              </div>

              <Show when={current().task.error}>
                <div class="alert-banner danger" role="alert">
                  <Icon name="alert" size={16} />
                  <div>
                    <strong>Task error</strong>
                    <p>{current().task.error}</p>
                  </div>
                </div>
              </Show>

              <Show when={pendingApprovals().length > 0}>
                <section class="panel approval-panel">
                  <header class="panel-header">
                    <div>
                      <h2 class="panel-title">
                        <Icon name="shield" size={17} /> Approval required
                      </h2>
                      <p class="panel-subtitle">
                        The agent is paused until you allow or reject these operations.
                      </p>
                    </div>
                    <span class="pill warn">{pendingApprovals().length} pending</span>
                  </header>
                  <div class="panel-body stack">
                    <For each={pendingApprovals()}>
                      {(approval) => (
                        <ApprovalCard
                          approval={approval}
                          onReply={(decision, message) =>
                            replyApproval(approval, decision, message)
                          }
                        />
                      )}
                    </For>
                  </div>
                </section>
              </Show>

              <div class="detail-grid">
                <div class="detail-main">
                  <Show when={liveText() && active()}>
                    <section class="panel">
                      <header class="panel-header">
                        <div>
                          <h2 class="panel-title">Live output</h2>
                          <p class="panel-subtitle">Streaming assistant text from OpenCode.</p>
                        </div>
                        <span class="live-dot" title="Streaming" aria-hidden="true" />
                      </header>
                      <div class="panel-body">
                        <pre class="stream-text">{liveText()}</pre>
                      </div>
                    </section>
                  </Show>

                  <Show when={current().task.summary}>
                    <section class="panel">
                      <header class="panel-header">
                        <div>
                          <h2 class="panel-title">Final report</h2>
                          <p class="panel-subtitle">
                            Most recent assistant message from the session.
                          </p>
                        </div>
                      </header>
                      <div class="panel-body">
                        <pre class="report-text">{current().task.summary}</pre>
                      </div>
                    </section>
                  </Show>

                  <Show when={current().task.planSummary}>
                    <section class="panel">
                      <header class="panel-header">
                        <div>
                          <h2 class="panel-title">Execution plan</h2>
                          <p class="panel-subtitle">
                            The earliest assistant message of the session.
                          </p>
                        </div>
                      </header>
                      <div class="panel-body">
                        <pre class="report-text">{current().task.planSummary}</pre>
                      </div>
                    </section>
                  </Show>

                  <section class="panel">
                    <header class="panel-header">
                      <div>
                        <h2 class="panel-title">Request</h2>
                        <p class="panel-subtitle">
                          The authoritative instruction sent to OpenCode.
                        </p>
                      </div>
                    </header>
                    <div class="panel-body">
                      <pre class="prompt-text">{current().task.prompt}</pre>
                    </div>
                  </section>

                  <section class="panel">
                    <header class="panel-header">
                      <div>
                        <h2 class="panel-title">Execution timeline</h2>
                        <p class="panel-subtitle">Plan phases and their observed state.</p>
                      </div>
                    </header>
                    <div class="panel-body">
                      <Timeline steps={current().steps} />
                    </div>
                  </section>

                  <section class="panel">
                    <header class="panel-header">
                      <div>
                        <h2 class="panel-title">Artifacts</h2>
                        <p class="panel-subtitle">
                          Files created, modified or deleted, bounded to the workspace.
                        </p>
                      </div>
                      <span class="pill">{current().artifacts.length}</span>
                    </header>
                    <div class="panel-body">
                      <ArtifactTable
                        artifacts={current().artifacts}
                        onOpen={(path) => setPreviewPath(path)}
                      />
                    </div>
                  </section>

                  <section class="panel">
                    <header class="panel-header">
                      <div>
                        <h2 class="panel-title">Conversation</h2>
                        <p class="panel-subtitle">
                          Assistant messages fetched from the OpenCode session.
                        </p>
                      </div>
                      <button
                        type="button"
                        class="button ghost small"
                        disabled={messagesLoading() || !current().task.sessionID}
                        onClick={() => void loadMessages()}
                      >
                        <Icon name="refresh" size={14} />
                        {messagesLoading() ? "Loading…" : "Load messages"}
                      </button>
                    </header>
                    <div class="panel-body stack">
                      <Show when={!current().task.sessionID}>
                        <p class="muted small">
                          No OpenCode session has been attached to this task yet.
                        </p>
                      </Show>
                      <Show when={messagesError()}>
                        <p class="form-error small">
                          <Icon name="alert" size={14} />
                          {messagesError()}
                        </p>
                      </Show>
                      <Show
                        when={messages().length > 0}
                        fallback={<p class="muted small">No assistant messages loaded.</p>}
                      >
                        <For each={messages()}>
                          {(message, index) => (
                            <article class="message-card">
                              <header class="message-head">
                                <strong>
                                  {index() === 0
                                    ? "Latest assistant message"
                                    : `Assistant message ${messages().length - index()}`}
                                </strong>
                                <Show when={message.finish}>
                                  <span class="pill small">{message.finish}</span>
                                </Show>
                              </header>
                              <pre class="message-text">{message.text || "(no text content)"}</pre>
                              <Show when={message.toolCalls.length > 0}>
                                <div class="chips">
                                  <For each={message.toolCalls}>
                                    {(call) => (
                                      <span class="chip static" title={call.name}>
                                        <Icon name="terminal" size={12} />
                                        {call.name}
                                        <Show when={call.status}>
                                          <span class="muted"> · {call.status}</span>
                                        </Show>
                                      </span>
                                    )}
                                  </For>
                                </div>
                              </Show>
                            </article>
                          )}
                        </For>
                      </Show>
                    </div>
                  </section>

                  <section class="panel">
                    <header class="panel-header">
                      <div>
                        <h2 class="panel-title">Event log</h2>
                        <p class="panel-subtitle">
                          Persisted lifecycle events plus live updates from this session.
                        </p>
                      </div>
                      <span class="pill">{mergedEvents().length}</span>
                    </header>
                    <div class="panel-body">
                      <EventList events={mergedEvents()} maxHeight />
                    </div>
                  </section>
                </div>

                <aside class="detail-side">
                  <section class="panel">
                    <header class="panel-header">
                      <div>
                        <h2 class="panel-title">Task facts</h2>
                      </div>
                    </header>
                    <div class="panel-body">
                      <dl class="facts">
                        <div>
                          <dt>Status</dt>
                          <dd>
                            <StatusBadge status={current().task.status} />
                          </dd>
                        </div>
                        <div>
                          <dt>Phase</dt>
                          <dd>{PHASE_LABELS[current().task.phase] ?? current().task.phase}</dd>
                        </div>
                        <div>
                          <dt>Model</dt>
                          <dd>{modelLabel(current().task)}</dd>
                        </div>
                        <div>
                          <dt>Agent</dt>
                          <dd>{current().task.agent}</dd>
                        </div>
                        <div>
                          <dt>Approval mode</dt>
                          <dd>{current().task.approvalMode}</dd>
                        </div>
                        <div>
                          <dt>Workspace</dt>
                          <dd class="mono small break">{current().task.workspacePath}</dd>
                        </div>
                        <div>
                          <dt>Session</dt>
                          <dd class="mono small break">
                            {current().task.sessionID ?? "not created"}
                            <Show when={current().task.sessionID}>
                              <button
                                type="button"
                                class="icon-button inline"
                                aria-label="Copy session ID"
                                onClick={() =>
                                  void copy(current().task.sessionID as string, "Session ID")
                                }
                              >
                                <Icon name="copy" size={13} />
                              </button>
                            </Show>
                          </dd>
                        </div>
                        <div>
                          <dt>Created</dt>
                          <dd>{formatDateTime(current().task.createdAt)}</dd>
                        </div>
                        <div>
                          <dt>Started</dt>
                          <dd>{formatDateTime(current().task.startedAt)}</dd>
                        </div>
                        <div>
                          <dt>Finished</dt>
                          <dd>{formatDateTime(current().task.finishedAt)}</dd>
                        </div>
                        <div>
                          <dt>Duration</dt>
                          <dd>
                            {formatDuration(current().task.startedAt, current().task.finishedAt)}
                          </dd>
                        </div>
                        <div>
                          <dt>Cost</dt>
                          <dd>{formatCost(current().task.cost)}</dd>
                        </div>
                        <div>
                          <dt>Tokens</dt>
                          <dd>{formatTokens(current().task.tokens)}</dd>
                        </div>
                        <div>
                          <dt>Task ID</dt>
                          <dd class="mono small break">
                            {current().task.id}
                            <button
                              type="button"
                              class="icon-button inline"
                              aria-label="Copy task ID"
                              onClick={() => void copy(current().task.id, "Task ID")}
                            >
                              <Icon name="copy" size={13} />
                            </button>
                          </dd>
                        </div>
                      </dl>
                    </div>
                  </section>

                  <section class="panel">
                    <header class="panel-header">
                      <div>
                        <h2 class="panel-title">Approval history</h2>
                      </div>
                    </header>
                    <div class="panel-body stack">
                      <Show
                        when={resolvedApprovals().length > 0}
                        fallback={<p class="muted small">No resolved approvals yet.</p>}
                      >
                        <For each={resolvedApprovals()}>
                          {(approval) => (
                            <ApprovalCard
                              approval={approval}
                              onReply={async () => {
                                notify("This approval has already been resolved.", "error")
                              }}
                            />
                          )}
                        </For>
                      </Show>
                    </div>
                  </section>

                  <section class="panel">
                    <header class="panel-header">
                      <div>
                        <h2 class="panel-title">Workspace</h2>
                      </div>
                    </header>
                    <div class="panel-body">
                      <p class="mono small break">{current().task.workspacePath}</p>
                      <p class="muted small">
                        Workspace access is validated server-side. This task cannot address paths
                        outside this directory through Cowork's API.
                      </p>
                      <button
                        type="button"
                        class="button ghost small full"
                        onClick={() => navigate("/workspaces")}
                      >
                        <Icon name="folder" size={14} />
                        Browse workspaces
                      </button>
                    </div>
                  </section>
                </aside>
              </div>

              <Show when={previewPath()}>
                {(path) => (
                  <Show when={current().task.workspaceID}>
                    <FilePreview
                      workspaceID={current().task.workspaceID}
                      path={path()}
                      onClose={() => setPreviewPath(null)}
                    />
                  </Show>
                )}
              </Show>
            </>
          )}
        </Show>
      </Show>
    </div>
  )
}
