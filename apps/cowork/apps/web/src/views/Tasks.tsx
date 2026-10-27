import { createSignal, For, onMount, Show } from "solid-js"
import { Icon } from "../components/Icons"
import { TaskCard } from "../components/TaskCard"
import { TaskComposer } from "../components/TaskComposer"
import { loadTasks, notify, setTaskFilter, taskFilter, tasks, taskTotal } from "../store"
import type { TaskStatus } from "../types"
import { STATUS_META } from "../utils"

const FILTERS: Array<{ value: TaskStatus | ""; label: string }> = [
  { value: "", label: "All" },
  { value: "running", label: "Running" },
  { value: "awaiting_approval", label: "Approvals" },
  { value: "queued", label: "Queued" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
  { value: "interrupted", label: "Interrupted" },
  { value: "cancelled", label: "Cancelled" },
]

export function TasksView() {
  const [search, setSearch] = createSignal("")
  const [composerOpen, setComposerOpen] = createSignal(false)

  onMount(() => {
    void loadTasks()
  })

  const filtered = () => {
    const query = search().trim().toLowerCase()
    if (!query) return tasks()
    return tasks().filter(
      (task) =>
        task.title.toLowerCase().includes(query) ||
        task.prompt.toLowerCase().includes(query) ||
        task.workspacePath.toLowerCase().includes(query),
    )
  }

  const setFilter = (value: TaskStatus | "") => {
    setTaskFilter(value)
    void loadTasks()
  }

  const refresh = async () => {
    await loadTasks()
    notify("Task list refreshed.")
  }

  return (
    <div class="page">
      <header class="page-header">
        <div>
          <p class="eyebrow">Tasks</p>
          <h1 class="page-title">Execution history</h1>
          <p class="page-subtitle">
            Every delegated task, its state and its approval boundary.{" "}
            {taskTotal() > tasks().length
              ? `Showing ${tasks().length} of ${taskTotal()}.`
              : `${taskTotal()} total.`}
          </p>
        </div>
        <div class="actions">
          <button type="button" class="button subtle" onClick={() => void refresh()}>
            <Icon name="refresh" size={16} />
            Refresh
          </button>
          <button
            type="button"
            class="button primary"
            onClick={() => setComposerOpen((current) => !current)}
          >
            <Icon name={composerOpen() ? "x" : "plus"} size={16} />
            {composerOpen() ? "Close composer" : "New task"}
          </button>
        </div>
      </header>

      <Show when={composerOpen()}>
        <section class="panel">
          <header class="panel-header">
            <div>
              <h2 class="panel-title">Delegate a task</h2>
              <p class="panel-subtitle">The task is persisted before OpenCode starts working.</p>
            </div>
          </header>
          <div class="panel-body">
            <TaskComposer
              compact
              onCreated={() => {
                setComposerOpen(false)
                void loadTasks()
              }}
            />
          </div>
        </section>
      </Show>

      <section class="panel">
        <header class="panel-header list-toolbar">
          {/* biome-ignore lint/a11y/useSemanticElements: status filters behave as a toggle group */}
          <div class="tabs" role="group" aria-label="Filter tasks by status">
            <For each={FILTERS}>
              {(option) => (
                <button
                  type="button"
                  class={`tab ${taskFilter() === option.value ? "active" : ""}`}
                  onClick={() => setFilter(option.value)}
                >
                  {option.label}
                </button>
              )}
            </For>
          </div>
          <label class="search-field">
            <Icon name="search" size={15} />
            <input
              type="search"
              placeholder="Search tasks…"
              value={search()}
              onInput={(event) => setSearch(event.currentTarget.value)}
              aria-label="Search tasks"
            />
          </label>
        </header>
        <div class="panel-body">
          <Show
            when={filtered().length > 0}
            fallback={
              <div class="empty">
                <Icon name="search" size={30} />
                <p>
                  {search() || taskFilter()
                    ? "No tasks match this filter."
                    : "No tasks yet. Delegate the first one."}
                </p>
                <Show when={!search() && !taskFilter()}>
                  <button type="button" class="button subtle" onClick={() => setComposerOpen(true)}>
                    <Icon name="plus" size={15} />
                    New task
                  </button>
                </Show>
              </div>
            }
          >
            <div class="task-list">
              <For each={filtered()}>{(task) => <TaskCard task={task} />}</For>
            </div>
          </Show>
        </div>
      </section>

      <p class="muted small">
        Statuses:{" "}
        {Object.values(STATUS_META)
          .map((meta) => meta.label)
          .join(" · ")}
      </p>
    </div>
  )
}
