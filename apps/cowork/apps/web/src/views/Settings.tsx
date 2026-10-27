import { createEffect, createSignal, For, onMount, Show } from "solid-js"
import { Icon } from "../components/Icons"
import {
  catalog,
  diagnostics,
  errorMessage,
  loadCatalog,
  loadDiagnostics,
  loadSystem,
  notify,
  saveSettings,
  system,
} from "../store"
import type { ApprovalMode, ModelRef } from "../types"
import { formatDateTime, jsonPreview } from "../utils"

function encodeModel(model: ModelRef | null): string {
  if (!model) return ""
  return JSON.stringify([model.providerID, model.id, model.variant ?? ""])
}

function decodeModel(value: string): ModelRef | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed) || parsed.length < 2) return null
    const providerID = String(parsed[0] ?? "")
    const id = String(parsed[1] ?? "")
    const variant = String(parsed[2] ?? "")
    if (!providerID || !id) return null
    return { providerID, id, ...(variant ? { variant } : {}) }
  } catch {
    return null
  }
}

export function SettingsView() {
  const [modelKey, setModelKey] = createSignal("")
  const [agent, setAgent] = createSignal("build")
  const [approvalMode, setApprovalMode] = createSignal<ApprovalMode>("ask")
  const [retention, setRetention] = createSignal(365)
  const [busy, setBusy] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  const [refreshing, setRefreshing] = createSignal(false)
  let initialized = false

  onMount(() => {
    void loadDiagnostics()
    void loadSystem()
    if (!catalog()) void loadCatalog()
  })

  createEffect(() => {
    if (initialized) return
    const settings = catalog()?.settings ?? system()?.settings
    if (!settings) return
    initialized = true
    setModelKey(encodeModel(settings.defaultModel))
    setAgent(settings.defaultAgent)
    setApprovalMode(settings.defaultApprovalMode)
    setRetention(settings.taskRetentionDays)
  })

  const agents = () =>
    (catalog()?.agents ?? []).filter(
      (entry) => !entry.hidden && (entry.mode === "primary" || entry.mode === "all"),
    )

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      await saveSettings({
        defaultModel: decodeModel(modelKey()),
        defaultAgent: agent(),
        defaultApprovalMode: approvalMode(),
        taskRetentionDays: Math.min(Math.max(Math.round(retention()), 1), 3650),
      })
      notify("Preferences saved.")
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  const refresh = async () => {
    setRefreshing(true)
    try {
      await Promise.all([loadDiagnostics(), loadSystem(), loadCatalog()])
      notify("Diagnostics refreshed.")
    } finally {
      setRefreshing(false)
    }
  }

  const copyDiagnostics = async () => {
    try {
      await navigator.clipboard.writeText(jsonPreview(diagnostics(), 200_000))
      notify("Redacted diagnostics copied.")
    } catch {
      notify("Could not copy diagnostics.", "error")
    }
  }

  return (
    <div class="page">
      <header class="page-header">
        <div>
          <p class="eyebrow">Settings</p>
          <h1 class="page-title">Defaults, engine and diagnostics</h1>
          <p class="page-subtitle">
            Preferences apply to new tasks. Existing tasks keep the model and approval policy
            captured at creation time.
          </p>
        </div>
        <div class="actions">
          <button
            type="button"
            class="button subtle"
            disabled={refreshing()}
            onClick={() => void refresh()}
          >
            <Icon name="refresh" size={16} />
            {refreshing() ? "Refreshing…" : "Refresh diagnostics"}
          </button>
        </div>
      </header>

      <div class="settings-grid">
        <section class="panel">
          <header class="panel-header">
            <div>
              <h2 class="panel-title">Task defaults</h2>
              <p class="panel-subtitle">Used by the composer when no explicit choice is made.</p>
            </div>
          </header>
          <div class="panel-body">
            <form
              class="stack"
              onSubmit={(event) => {
                event.preventDefault()
                void save()
              }}
            >
              <label class="field">
                <span class="field-label">Default model</span>
                <select
                  class="input select"
                  value={modelKey()}
                  onChange={(event) => setModelKey(event.currentTarget.value)}
                >
                  <option value="">OpenCode default</option>
                  <For each={catalog()?.providers ?? []}>
                    {(provider) => (
                      <Show when={provider.models.length > 0}>
                        <optgroup label={provider.name}>
                          <For each={provider.models}>
                            {(model) => (
                              <option
                                value={encodeModel({ providerID: provider.id, id: model.id })}
                              >
                                {model.name}
                              </option>
                            )}
                          </For>
                        </optgroup>
                      </Show>
                    )}
                  </For>
                </select>
                <span class="field-hint">
                  {(catalog()?.providers ?? []).reduce(
                    (total, provider) => total + provider.models.length,
                    0,
                  )}{" "}
                  models discovered through the OpenCode SDK.
                </span>
              </label>

              <label class="field">
                <span class="field-label">Default agent</span>
                <select
                  class="input select"
                  value={agent()}
                  onChange={(event) => setAgent(event.currentTarget.value)}
                >
                  <Show when={agents().length === 0}>
                    <option value="build">build</option>
                  </Show>
                  <For each={agents()}>
                    {(entry) => <option value={entry.id}>{entry.name}</option>}
                  </For>
                </select>
              </label>

              <label class="field">
                <span class="field-label">Default approval mode</span>
                <select
                  class="input select"
                  value={approvalMode()}
                  onChange={(event) => setApprovalMode(event.currentTarget.value as ApprovalMode)}
                >
                  <option value="ask">Ask before risky tools</option>
                  <option value="strict">Strict</option>
                  <option value="auto">Automatic</option>
                </select>
              </label>

              <dl class="mode-notes">
                <div>
                  <dt>Ask</dt>
                  <dd>
                    Reads are allowed. File edits, shell commands and network tools pause for
                    approval.
                  </dd>
                </div>
                <div>
                  <dt>Strict</dt>
                  <dd>
                    Edits and commands require approval. Network tools, subagents and browser tools
                    are denied.
                  </dd>
                </div>
                <div>
                  <dt>Automatic</dt>
                  <dd>
                    Every tool runs without prompting. Intended for disposable or fully trusted
                    workspaces.
                  </dd>
                </div>
              </dl>

              <label class="field">
                <span class="field-label">Task retention (days)</span>
                <input
                  class="input"
                  type="number"
                  min={1}
                  max={3650}
                  value={retention()}
                  onInput={(event) => setRetention(Number(event.currentTarget.value))}
                />
                <span class="field-hint">
                  Stored as a preference. Automatic deletion is not implemented in this release.
                </span>
              </label>

              <Show when={error()}>
                <p class="form-error" role="alert">
                  <Icon name="alert" size={15} />
                  {error()}
                </p>
              </Show>

              <div class="form-actions">
                <button type="submit" class="button primary" disabled={busy()}>
                  <Icon name="check" size={16} />
                  {busy() ? "Saving…" : "Save preferences"}
                </button>
              </div>
            </form>
          </div>
        </section>

        <section class="panel">
          <header class="panel-header">
            <div>
              <h2 class="panel-title">Runtime</h2>
              <p class="panel-subtitle">Local Cowork server and persistence.</p>
            </div>
          </header>
          <div class="panel-body">
            <dl class="facts">
              <div>
                <dt>Version</dt>
                <dd>{system()?.version ?? "—"}</dd>
              </div>
              <div>
                <dt>Uptime</dt>
                <dd>{system() ? `${system()?.uptimeSeconds}s` : "—"}</dd>
              </div>
              <div>
                <dt>OpenCode</dt>
                <dd>
                  <span
                    class={`health-dot ${system()?.opencode.connected ? "online" : "offline"}`}
                  />
                  {system()?.opencode.connected
                    ? `connected · v${system()?.opencode.version ?? "?"}`
                    : (system()?.opencode.error ?? "unavailable")}
                </dd>
              </div>
              <div>
                <dt>OpenCode URL</dt>
                <dd class="mono small break">{system()?.opencode.url ?? "—"}</dd>
              </div>
              <div>
                <dt>Connection mode</dt>
                <dd>{system()?.opencode.mode ?? "—"}</dd>
              </div>
              <div>
                <dt>Database</dt>
                <dd class="mono small break">{system()?.database.file ?? "—"}</dd>
              </div>
              <div>
                <dt>Schema</dt>
                <dd>v{system()?.database.schemaVersion ?? "—"}</dd>
              </div>
              <div>
                <dt>Max prompt</dt>
                <dd>{system()?.limits.maxPromptChars.toLocaleString() ?? "—"} characters</dd>
              </div>
              <div>
                <dt>Max snapshot files</dt>
                <dd>{system()?.limits.maxFiles.toLocaleString() ?? "—"}</dd>
              </div>
              <div>
                <dt>Request body limit</dt>
                <dd>{system()?.limits.bodyLimit.toLocaleString() ?? "—"} bytes</dd>
              </div>
            </dl>
            <p class="hint">
              <Icon name="shield" size={14} />
              The API token is generated locally and injected into the served UI. It is never
              displayed here or stored in the database.
            </p>
          </div>
        </section>
      </div>

      <section class="panel">
        <header class="panel-header">
          <div>
            <h2 class="panel-title">Providers and models</h2>
            <p class="panel-subtitle">Catalog reported by the OpenCode background service.</p>
          </div>
          <span class="pill">{diagnostics()?.providers.length ?? 0} providers</span>
        </header>
        <div class="panel-body">
          <Show
            when={(diagnostics()?.providers.length ?? 0) > 0}
            fallback={<p class="muted small">No provider diagnostics available.</p>}
          >
            <div class="provider-grid">
              <For each={diagnostics()?.providers ?? []}>
                {(provider) => (
                  <div class="provider-card">
                    <strong>{provider.name}</strong>
                    <span class="mono small">{provider.id}</span>
                    <span class="muted small">{provider.models} models</span>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </div>
      </section>

      <div class="settings-grid">
        <section class="panel">
          <header class="panel-header">
            <div>
              <h2 class="panel-title">Agents and skills</h2>
              <p class="panel-subtitle">Discovered from the current OpenCode configuration.</p>
            </div>
          </header>
          <div class="panel-body stack">
            <div>
              <h3 class="subheading">Agents</h3>
              <Show
                when={(diagnostics()?.agents.length ?? 0) > 0}
                fallback={<p class="muted small">No agents reported.</p>}
              >
                <ul class="plain-list">
                  <For each={diagnostics()?.agents ?? []}>
                    {(entry) => (
                      <li>
                        <span class="mono">{entry.id}</span>
                        <span class="muted small">
                          {entry.mode}
                          {entry.hidden ? " · hidden" : ""}
                        </span>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            </div>
            <div>
              <h3 class="subheading">Skills</h3>
              <Show
                when={(diagnostics()?.skills.length ?? 0) > 0}
                fallback={<p class="muted small">No skills reported.</p>}
              >
                <ul class="plain-list">
                  <For each={diagnostics()?.skills ?? []}>
                    {(skill) => (
                      <li>
                        <span class="mono">{skill.name}</span>
                        <span class="muted small">
                          {skill.description ?? ""}
                          {skill.autoinvoke ? " · auto" : ""}
                        </span>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            </div>
          </div>
        </section>

        <section class="panel">
          <header class="panel-header">
            <div>
              <h2 class="panel-title">MCP servers</h2>
              <p class="panel-subtitle">Configured integrations and their connection state.</p>
            </div>
            <button type="button" class="button ghost small" onClick={() => void copyDiagnostics()}>
              <Icon name="copy" size={14} />
              Copy diagnostics
            </button>
          </header>
          <div class="panel-body">
            <Show
              when={(diagnostics()?.mcp.length ?? 0) > 0}
              fallback={
                <p class="muted small">
                  No MCP servers configured. Cowork does not register tools automatically.
                </p>
              }
            >
              <ul class="plain-list">
                <For each={diagnostics()?.mcp ?? []}>
                  {(server) => (
                    <li>
                      <span class="mono">{server.name}</span>
                      <span
                        class={`badge ${server.status === "connected" ? "tone-success" : "tone-neutral"}`}
                      >
                        {server.status}
                      </span>
                      <Show when={server.error}>
                        <span class="muted small">{server.error}</span>
                      </Show>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
            <p class="muted small">
              Diagnostics were last read at{" "}
              {formatDateTime(diagnostics()?.health.checkedAt ?? null)}.
            </p>
          </div>
        </section>
      </div>

      <section class="panel">
        <header class="panel-header">
          <div>
            <h2 class="panel-title">Security posture</h2>
            <p class="panel-subtitle">What this release does and does not guarantee.</p>
          </div>
        </header>
        <div class="panel-body">
          <ul class="check-list">
            <li>
              <Icon name="check" size={15} />
              The Cowork API requires a per-installation token and enforces an Origin allow-list on
              API requests.
            </li>
            <li>
              <Icon name="check" size={15} />
              File browsing and artifact lookup resolve real paths and reject traversal and symlink
              escapes.
            </li>
            <li>
              <Icon name="check" size={15} />
              Sensitive tool calls can pause for explicit approval before OpenCode executes them.
            </li>
            <li>
              <Icon name="alert" size={15} />
              OpenCode itself runs as the same OS user and is not placed inside an OS-level sandbox.
              Workspace boundaries are enforced by Cowork's policy and path guard; a hostile agent
              with unrestricted shell access could still reach other paths.
            </li>
            <li>
              <Icon name="alert" size={15} />
              Prompt injection from files, web pages or tool output cannot be fully prevented.
              Instructions embedded in untrusted content are not privileged.
            </li>
          </ul>
        </div>
      </section>
    </div>
  )
}
