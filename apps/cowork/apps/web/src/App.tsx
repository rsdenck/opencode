import { createEffect, createSignal, For, Match, onCleanup, onMount, Show, Switch } from "solid-js"
import { API_TOKEN } from "./api"
import { Icon } from "./components/Icons"
import { Toast } from "./components/Toast"
import type { Route } from "./store"
import {
  bootError,
  booting,
  bootstrap,
  loadCatalog,
  loadSystem,
  loadTasks,
  loadWorkspaces,
  notify,
  route,
  startEventStream,
  streamState,
  system,
} from "./store"
import { DashboardView } from "./views/Dashboard"
import { SettingsView } from "./views/Settings"
import { TaskDetailView } from "./views/TaskDetail"
import { TasksView } from "./views/Tasks"
import { WorkspacesView } from "./views/Workspaces"

const NAV: Array<{
  name: Route["name"]
  label: string
  href: string
  icon: "home" | "tasks" | "folder" | "settings"
}> = [
  { name: "dashboard", label: "Overview", href: "#/", icon: "home" },
  { name: "tasks", label: "Tasks", href: "#/tasks", icon: "tasks" },
  { name: "workspaces", label: "Workspaces", href: "#/workspaces", icon: "folder" },
  { name: "settings", label: "Settings", href: "#/settings", icon: "settings" },
]

const TITLES: Record<Route["name"], string> = {
  dashboard: "Overview",
  tasks: "Tasks",
  task: "Task detail",
  workspaces: "Workspaces",
  settings: "Settings",
}

function isActive(current: Route, target: Route["name"]): boolean {
  if (target === "tasks") return current.name === "tasks" || current.name === "task"
  return current.name === target
}

export function App() {
  const [sidebarOpen, setSidebarOpen] = createSignal(false)

  onMount(() => {
    void bootstrap()
    const stopStream = startEventStream()
    const systemTimer = setInterval(() => void loadSystem(), 30_000)
    const taskTimer = setInterval(() => void loadTasks(), 45_000)
    onCleanup(() => {
      stopStream()
      clearInterval(systemTimer)
      clearInterval(taskTimer)
    })
  })

  createEffect(() => {
    route()
    setSidebarOpen(false)
  })

  const refresh = async () => {
    await Promise.all([loadSystem(), loadCatalog(), loadWorkspaces(), loadTasks()])
    notify("State refreshed.")
  }

  const health = () => system()?.opencode

  return (
    <div class="app-shell">
      <Show when={sidebarOpen()}>
        <button
          type="button"
          class="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
        />
      </Show>

      <aside class={`sidebar ${sidebarOpen() ? "open" : ""}`}>
        <a class="brand" href="#/" aria-label="OpenCode Cowork overview">
          <span class="brand-mark">
            <Icon name="zap" size={18} />
          </span>
          <span class="brand-text">
            <strong>Cowork</strong>
            <span>OpenCode workbench</span>
          </span>
        </a>

        <nav class="nav" aria-label="Primary navigation">
          <For each={NAV}>
            {(item) => (
              <a
                class={`nav-item ${isActive(route(), item.name) ? "active" : ""}`}
                href={item.href}
                aria-current={isActive(route(), item.name) ? "page" : undefined}
              >
                <Icon name={item.icon} size={17} />
                <span>{item.label}</span>
                <Show when={item.name === "tasks"}>
                  <span class="nav-count">
                    {system()?.counts.activeTasks ? `${system()?.counts.activeTasks} active` : ""}
                  </span>
                </Show>
              </a>
            )}
          </For>
        </nav>

        <div class="sidebar-spacer" />

        <div class="sidebar-footer">
          <div class="engine-card">
            <span class={`health-dot ${health()?.connected ? "online" : "offline"}`} />
            <div>
              <strong>OpenCode {health()?.version ?? ""}</strong>
              <span>
                {health()?.connected
                  ? health()?.mode === "background-service"
                    ? "shared background service"
                    : "connected endpoint"
                  : (health()?.error ?? "not connected")}
              </span>
            </div>
          </div>
          <div class="sidebar-meta">
            <span>Cowork v{system()?.version ?? "0.1.0"}</span>
            <span>local-first · {streamState()}</span>
          </div>
        </div>
      </aside>

      <div class="main">
        <header class="topbar">
          <button
            type="button"
            class="icon-button menu-button"
            aria-label="Open navigation"
            onClick={() => setSidebarOpen(true)}
          >
            <Icon name="menu" size={18} />
          </button>
          <div class="topbar-title">
            <span class="topbar-section">{TITLES[route().name]}</span>
            <span class="topbar-sub">
              {health()?.connected ? "Engine connected" : "Engine unavailable"}
            </span>
          </div>
          <div class="topbar-actions">
            <span class={`stream-status ${streamState()}`}>
              <span class="health-dot" />
              {streamState()}
            </span>
            <button
              type="button"
              class="icon-button"
              aria-label="Refresh workbench state"
              onClick={() => void refresh()}
            >
              <Icon name="refresh" size={17} />
            </button>
          </div>
        </header>

        <Show when={!API_TOKEN}>
          <div class="alert-banner warning">
            <Icon name="alert" size={16} />
            <div>
              <strong>API token missing</strong>
              <p>
                Open the application through the Cowork server (not the raw Vite dev server) so the
                local token can be injected, or set <code>COWORK_AUTH_TOKEN</code>.
              </p>
            </div>
          </div>
        </Show>

        <Show when={bootError()}>
          <div class="alert-banner danger">
            <Icon name="alert" size={16} />
            <div>
              <strong>Could not load workbench state</strong>
              <p>{bootError()}</p>
            </div>
            <button type="button" class="button subtle small" onClick={() => void bootstrap()}>
              Retry
            </button>
          </div>
        </Show>

        <main class="content">
          <Show
            when={!booting()}
            fallback={
              <div class="boot-skeleton" aria-live="polite">
                <div class="skeleton line wide" />
                <div class="skeleton line" />
                <div class="skeleton-grid">
                  <div class="skeleton block" />
                  <div class="skeleton block" />
                  <div class="skeleton block" />
                  <div class="skeleton block" />
                </div>
                <div class="skeleton line wide" />
                <div class="skeleton block tall" />
                <p class="muted small">Connecting to OpenCode and loading persisted state…</p>
              </div>
            }
          >
            <Switch>
              <Match when={route().name === "dashboard"}>
                <DashboardView />
              </Match>
              <Match when={route().name === "tasks"}>
                <TasksView />
              </Match>
              <Match when={route().name === "task"}>
                <TaskDetailView />
              </Match>
              <Match when={route().name === "workspaces"}>
                <WorkspacesView />
              </Match>
              <Match when={route().name === "settings"}>
                <SettingsView />
              </Match>
            </Switch>
          </Show>
        </main>
      </div>

      <Toast />
    </div>
  )
}
