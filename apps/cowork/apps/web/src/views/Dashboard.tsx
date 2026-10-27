import { createMemo, For, onMount, Show } from "solid-js"
import { Icon } from "../components/Icons"
import { StatusBadge } from "../components/StatusBadge"
import { TaskCard } from "../components/TaskCard"
import { TaskComposer } from "../components/TaskComposer"
import {
  catalog,
  loadSystem,
  loadTasks,
  loadWorkspaces,
  navigate,
  notify,
  streamState,
  system,
  tasks,
  workspaces,
} from "../store"
import { formatRelative, isTerminal } from "../utils"

export function DashboardView() {
  onMount(() => {
    void loadSystem()
    void loadTasks()
    void loadWorkspaces()
  })

  const activeTasks = () =>
    tasks().filter((task) => !isTerminal(task.status) && task.status !== "interrupted")
  const awaiting = () => tasks().filter((task) => task.status === "awaiting_approval")
  const resumable = () => tasks().filter((task) => task.resumable)
  const recent = createMemo(() => tasks().slice(0, 5))
  const health = () => system()?.opencode

  const refresh = async () => {
    await Promise.all([loadSystem(), loadTasks(), loadWorkspaces()])
    notify("Workbench state refreshed.")
  }

  return (
    <div class="page">
      <header class="page-header">
        <div>
          <p class="eyebrow">Workbench</p>
          <h1 class="page-title">Delegate work, follow execution, verify results.</h1>
          <p class="page-subtitle">
            OpenCode Cowork runs real agent sessions inside registered workspaces and keeps an
            auditable record of every task.
          </p>
        </div>
        <div class="actions">
          <button type="button" class="button subtle" onClick={() => void refresh()}>
            <Icon name="refresh" size={16} />
            Refresh
          </button>
          <a class="button ghost" href="#/tasks">
            <Icon name="tasks" size={16} />
            All tasks
          </a>
        </div>
      </header>

      <section class="metrics" aria-label="Workbench metrics">
        <article class="metric">
          <span class="metric-label">
            <Icon name="activity" size={15} />
            Active tasks
          </span>
          <strong class="metric-value">
            {system()?.counts.activeTasks ?? activeTasks().length}
          </strong>
          <span class="metric-foot">
            {awaiting().length > 0
              ? `${awaiting().length} waiting for approval`
              : "No approvals waiting"}
          </span>
        </article>
        <article class="metric">
          <span class="metric-label">
            <Icon name="tasks" size={15} />
            Task history
          </span>
          <strong class="metric-value">{system()?.counts.tasks ?? tasks().length}</strong>
          <span class="metric-foot">
            {resumable().length > 0 ? `${resumable().length} resumable` : "Persistent SQLite store"}
          </span>
        </article>
        <article class="metric">
          <span class="metric-label">
            <Icon name="folder" size={15} />
            Workspaces
          </span>
          <strong class="metric-value">{workspaces().length}</strong>
          <span class="metric-foot">
            {workspaces()[0] ? `Latest: ${workspaces()[0]?.name}` : "None registered"}
          </span>
        </article>
        <article class="metric">
          <span class="metric-label">
            <Icon name="cpu" size={15} />
            Model catalog
          </span>
          <strong class="metric-value">
            {(catalog()?.providers ?? []).reduce(
              (total, provider) => total + provider.models.length,
              0,
            )}
          </strong>
          <span class="metric-foot">{(catalog()?.providers ?? []).length} providers available</span>
        </article>
      </section>

      <div class="dashboard-grid">
        <div class="dashboard-primary">
          <section class="panel">
            <header class="panel-header">
              <div>
                <h2 class="panel-title">New task</h2>
                <p class="panel-subtitle">
                  Choose a workspace, describe the outcome, and let the agent execute.
                </p>
              </div>
            </header>
            <div class="panel-body">
              <TaskComposer />
            </div>
          </section>

          <section class="panel">
            <header class="panel-header">
              <div>
                <h2 class="panel-title">Recent tasks</h2>
                <p class="panel-subtitle">Most recently created executions.</p>
              </div>
              <a class="button ghost small" href="#/tasks">
                View all
              </a>
            </header>
            <div class="panel-body">
              <Show
                when={recent().length > 0}
                fallback={
                  <div class="empty">
                    <Icon name="tasks" size={30} />
                    <p>No tasks yet. Delegate the first one above.</p>
                  </div>
                }
              >
                <div class="task-list">
                  <For each={recent()}>{(task) => <TaskCard task={task} />}</For>
                </div>
              </Show>
            </div>
          </section>
        </div>

        <aside class="dashboard-side">
          <section class="panel attention-panel">
            <header class="panel-header">
              <div>
                <h2 class="panel-title">Needs attention</h2>
                <p class="panel-subtitle">Tasks blocked on a human decision.</p>
              </div>
              <span class={`pill ${awaiting().length > 0 ? "warn" : ""}`}>{awaiting().length}</span>
            </header>
            <div class="panel-body">
              <Show
                when={awaiting().length > 0}
                fallback={
                  <p class="muted small">
                    Nothing waiting. Risky tool calls will appear here for approval.
                  </p>
                }
              >
                <For each={awaiting()}>
                  {(task) => (
                    <button
                      type="button"
                      class="attention-item"
                      onClick={() => navigate(`/tasks/${task.id}`)}
                    >
                      <StatusBadge status={task.status} />
                      <span class="attention-title">{task.title}</span>
                      <span class="muted small">{formatRelative(task.updatedAt)}</span>
                      <Icon name="chevronRight" size={15} />
                    </button>
                  )}
                </For>
              </Show>
            </div>
          </section>

          <section class="panel">
            <header class="panel-header">
              <div>
                <h2 class="panel-title">Engine status</h2>
                <p class="panel-subtitle">Live view of the OpenCode integration.</p>
              </div>
            </header>
            <div class="panel-body">
              <dl class="status-list">
                <div class="status-row">
                  <dt>OpenCode</dt>
                  <dd>
                    <span class={`health-dot ${health()?.connected ? "online" : "offline"}`} />
                    {health()?.connected ? "Connected" : health() ? "Unavailable" : "Checking…"}
                  </dd>
                </div>
                <div class="status-row">
                  <dt>Version</dt>
                  <dd>{health()?.version ?? "—"}</dd>
                </div>
                <div class="status-row">
                  <dt>Connection</dt>
                  <dd>{health()?.mode?.replaceAll("-", " ") ?? "—"}</dd>
                </div>
                <div class="status-row">
                  <dt>Event stream</dt>
                  <dd>
                    <span
                      class={`health-dot ${streamState() === "connected" ? "online" : "pending"}`}
                    />
                    {streamState()}
                  </dd>
                </div>
                <div class="status-row">
                  <dt>Database</dt>
                  <dd>schema v{system()?.database.schemaVersion ?? "—"}</dd>
                </div>
              </dl>
              <Show when={health() && !health()?.connected}>
                <p class="form-error small">
                  <Icon name="alert" size={14} />
                  {health()?.error}
                </p>
              </Show>
              <a class="button ghost small full" href="#/settings">
                Diagnostics and settings
                <Icon name="chevronRight" size={14} />
              </a>
            </div>
          </section>

          <section class="panel">
            <header class="panel-header">
              <div>
                <h2 class="panel-title">Workspaces</h2>
                <p class="panel-subtitle">Approved directories for agent work.</p>
              </div>
              <a class="button ghost small" href="#/workspaces">
                Manage
              </a>
            </header>
            <div class="panel-body">
              <Show
                when={workspaces().length > 0}
                fallback={
                  <div class="empty compact">
                    <Icon name="folder" size={24} />
                    <p>No workspace registered yet.</p>
                    <a class="button subtle small" href="#/workspaces">
                      Add workspace
                    </a>
                  </div>
                }
              >
                <ul class="mini-list">
                  <For each={workspaces().slice(0, 4)}>
                    {(workspace) => (
                      <li>
                        <Icon name="folder" size={14} />
                        <span class="mini-list-name">{workspace.name}</span>
                        <span class="mini-list-path" title={workspace.path}>
                          {workspace.path}
                        </span>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}
