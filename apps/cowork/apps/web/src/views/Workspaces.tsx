import { createEffect, createSignal, For, onMount, Show } from "solid-js"
import { api } from "../api"
import { FileBrowser } from "../components/FileBrowser"
import { Icon } from "../components/Icons"
import { StatusBadge } from "../components/StatusBadge"
import {
  errorMessage,
  loadWorkspaces,
  notify,
  removeWorkspaceLocal,
  system,
  upsertWorkspace,
  workspaces,
} from "../store"
import type { Task, Workspace } from "../types"
import { formatRelative } from "../utils"

export function WorkspacesView() {
  const [path, setPath] = createSignal("")
  const [name, setName] = createSignal("")
  const [busy, setBusy] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  const [selected, setSelected] = createSignal<string | null>(null)
  const [workspaceTasks, setWorkspaceTasks] = createSignal<Task[]>([])
  const [loadingTasks, setLoadingTasks] = createSignal(false)

  onMount(() => {
    void loadWorkspaces()
  })

  createEffect(() => {
    const list = workspaces()
    if (selected() && !list.some((workspace) => workspace.id === selected())) {
      setSelected(list[0]?.id ?? null)
      return
    }
    if (!selected() && list[0]) setSelected(list[0].id)
  })

  createEffect(() => {
    const id = selected()
    if (!id) {
      setWorkspaceTasks([])
      return
    }
    let cancelled = false
    setLoadingTasks(true)
    api
      .listTasks({ workspaceID: id, limit: 8 })
      .then((result) => {
        if (!cancelled) setWorkspaceTasks(result.tasks)
      })
      .catch(() => {
        if (!cancelled) setWorkspaceTasks([])
      })
      .finally(() => {
        if (!cancelled) setLoadingTasks(false)
      })
    return () => {
      cancelled = true
    }
  })

  const selectedWorkspace = (): Workspace | undefined =>
    workspaces().find((workspace) => workspace.id === selected())

  const submit = async () => {
    if (!path().trim()) {
      setError("Enter the absolute path of a directory on the Cowork host.")
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = await api.addWorkspace({
        path: path().trim(),
        ...(name().trim() ? { name: name().trim() } : {}),
      })
      upsertWorkspace(result.workspace)
      setSelected(result.workspace.id)
      setPath("")
      setName("")
      notify(`Workspace "${result.workspace.name}" registered.`)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (workspace: Workspace) => {
    if (
      !window.confirm(
        `Remove workspace "${workspace.name}" from Cowork? Files on disk are not touched. Workspaces with task history cannot be removed.`,
      )
    ) {
      return
    }
    try {
      await api.removeWorkspace(workspace.id)
      removeWorkspaceLocal(workspace.id)
      notify("Workspace removed from Cowork.")
    } catch (caught) {
      notify(errorMessage(caught), "error")
    }
  }

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      notify("Path copied.")
    } catch {
      notify("Could not copy to the clipboard.", "error")
    }
  }

  const maxFiles = () => system()?.limits.maxFiles ?? 5000

  return (
    <div class="page">
      <header class="page-header">
        <div>
          <p class="eyebrow">Workspaces</p>
          <h1 class="page-title">Bounded working directories</h1>
          <p class="page-subtitle">
            Register absolute host paths. Cowork validates each path, resolves symlinks and keeps
            every task scoped to its workspace.
          </p>
        </div>
        <div class="actions">
          <button type="button" class="button subtle" onClick={() => void loadWorkspaces()}>
            <Icon name="refresh" size={16} />
            Refresh
          </button>
        </div>
      </header>

      <section class="panel">
        <header class="panel-header">
          <div>
            <h2 class="panel-title">Register a workspace</h2>
            <p class="panel-subtitle">
              The directory must already exist on the machine running Cowork.
            </p>
          </div>
        </header>
        <div class="panel-body">
          <form
            class="inline-form"
            onSubmit={(event) => {
              event.preventDefault()
              void submit()
            }}
          >
            <label class="field grow">
              <span class="field-label">Absolute path</span>
              <input
                class="input"
                type="text"
                placeholder="/home/you/projects/my-project"
                value={path()}
                onInput={(event) => setPath(event.currentTarget.value)}
                autocomplete="off"
                spellcheck={false}
              />
            </label>
            <label class="field">
              <span class="field-label">Display name (optional)</span>
              <input
                class="input"
                type="text"
                placeholder="My project"
                value={name()}
                onInput={(event) => setName(event.currentTarget.value)}
              />
            </label>
            <button type="submit" class="button primary" disabled={busy()}>
              <Icon name="plus" size={16} />
              {busy() ? "Registering…" : "Add workspace"}
            </button>
          </form>
          <Show when={error()}>
            <p class="form-error" role="alert">
              <Icon name="alert" size={15} />
              {error()}
            </p>
          </Show>
          <p class="hint">
            <Icon name="shield" size={14} />
            System directories such as <code>/</code>, <code>/etc</code>, <code>/usr</code> and{" "}
            <code>/root</code> are rejected. If <code>COWORK_ALLOWED_WORKSPACE_ROOTS</code> is set,
            only descendants of those roots are accepted.
          </p>
        </div>
      </section>

      <div class="workspace-layout">
        <section class="panel">
          <header class="panel-header">
            <div>
              <h2 class="panel-title">Registered workspaces</h2>
              <p class="panel-subtitle">{workspaces().length} available.</p>
            </div>
          </header>
          <div class="panel-body">
            <Show
              when={workspaces().length > 0}
              fallback={
                <div class="empty compact">
                  <Icon name="folder" size={26} />
                  <p>No workspace registered yet.</p>
                </div>
              }
            >
              <ul class="workspace-list">
                <For each={workspaces()}>
                  {(workspace) => (
                    <li class={`workspace-item ${selected() === workspace.id ? "selected" : ""}`}>
                      <button
                        type="button"
                        class="workspace-main"
                        onClick={() => setSelected(workspace.id)}
                      >
                        <span class="workspace-icon">
                          <Icon name="folder" size={18} />
                        </span>
                        <span class="workspace-info">
                          <span class="workspace-name">{workspace.name}</span>
                          <span class="workspace-path mono" title={workspace.path}>
                            {workspace.path}
                          </span>
                          <span class="muted small">
                            Added {formatRelative(workspace.createdAt)}
                            {workspace.lastUsedAt
                              ? ` · last used ${formatRelative(workspace.lastUsedAt)}`
                              : ""}
                          </span>
                        </span>
                      </button>
                      <div class="workspace-actions">
                        <button
                          type="button"
                          class="icon-button"
                          aria-label={`Copy path for ${workspace.name}`}
                          onClick={() => void copy(workspace.path)}
                        >
                          <Icon name="copy" size={15} />
                        </button>
                        <button
                          type="button"
                          class="icon-button danger"
                          aria-label={`Remove ${workspace.name}`}
                          onClick={() => void remove(workspace)}
                        >
                          <Icon name="x" size={16} />
                        </button>
                      </div>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </div>
        </section>

        <section class="panel">
          <header class="panel-header">
            <div>
              <h2 class="panel-title">
                {selectedWorkspace() ? selectedWorkspace()?.name : "Workspace files"}
              </h2>
              <p class="panel-subtitle">
                Read-only browsing with path guards. Limit: {maxFiles().toLocaleString()} files per
                snapshot.
              </p>
            </div>
          </header>
          <div class="panel-body">
            <Show
              when={selectedWorkspace()}
              fallback={<p class="muted small">Select a workspace to browse its files.</p>}
            >
              {(workspace) => <FileBrowser workspaceID={workspace().id} />}
            </Show>
          </div>
        </section>
      </div>

      <section class="panel">
        <header class="panel-header">
          <div>
            <h2 class="panel-title">Recent tasks in this workspace</h2>
            <p class="panel-subtitle">Latest eight executions.</p>
          </div>
        </header>
        <div class="panel-body">
          <Show
            when={workspaceTasks().length > 0}
            fallback={
              <p class="muted small">
                {loadingTasks() ? "Loading tasks…" : "No tasks recorded for this workspace."}
              </p>
            }
          >
            <ul class="mini-task-list">
              <For each={workspaceTasks()}>
                {(task) => (
                  <li>
                    <a href={`#/tasks/${task.id}`} class="mini-task">
                      <StatusBadge status={task.status} />
                      <span class="mini-task-title">{task.title}</span>
                      <span class="muted small">{formatRelative(task.createdAt)}</span>
                      <Icon name="chevronRight" size={15} />
                    </a>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </div>
      </section>
    </div>
  )
}
