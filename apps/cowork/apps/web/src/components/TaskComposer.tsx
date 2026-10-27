import { createEffect, createSignal, For, Show } from "solid-js"
import { api } from "../api"
import { catalog, errorMessage, navigate, notify, system, workspaces } from "../store"
import type { ApprovalMode, ModelRef, Task } from "../types"
import { Icon } from "./Icons"

const APPROVAL_HINTS: Record<ApprovalMode, string> = {
  ask: "File edits, commands and network tools wait for your approval.",
  auto: "All tools run without prompting. Use only in trusted workspaces.",
  strict: "Edits and commands require approval; network access is blocked.",
}

function encodeModel(model: ModelRef): string {
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

export function TaskComposer(props: {
  workspaceID?: string
  onCreated?: (task: Task) => void
  compact?: boolean
}) {
  const [workspaceID, setWorkspaceID] = createSignal(props.workspaceID ?? "")
  const [prompt, setPrompt] = createSignal("")
  const [title, setTitle] = createSignal("")
  const [modelKey, setModelKey] = createSignal("")
  const [agent, setAgent] = createSignal("")
  const [approvalMode, setApprovalMode] = createSignal<ApprovalMode>("ask")
  const [busy, setBusy] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  const [showAdvanced, setShowAdvanced] = createSignal(false)

  createEffect(() => {
    const cat = catalog()
    if (!cat) return
    setAgent((current) => current || cat.settings.defaultAgent)
    setApprovalMode((current) => current || cat.settings.defaultApprovalMode)
    if (!modelKey() && cat.settings.defaultModel)
      setModelKey(encodeModel(cat.settings.defaultModel))
  })

  createEffect(() => {
    const list = workspaces()
    if (props.workspaceID && workspaceID() !== props.workspaceID) {
      setWorkspaceID(props.workspaceID)
      return
    }
    if (workspaceID() && !list.some((workspace) => workspace.id === workspaceID())) {
      setWorkspaceID(list[0]?.id ?? "")
      return
    }
    if (!workspaceID() && list[0]) setWorkspaceID(list[0].id)
  })

  const agents = () =>
    (catalog()?.agents ?? []).filter(
      (entry) => !entry.hidden && (entry.mode === "primary" || entry.mode === "all"),
    )
  const maxChars = () => system()?.limits.maxPromptChars ?? 20_000
  const selectedModel = () => decodeModel(modelKey())
  const canSubmit = () =>
    !busy() &&
    workspaceID().length > 0 &&
    prompt().trim().length > 0 &&
    prompt().length <= maxChars()

  const submit = async () => {
    if (!canSubmit()) {
      setError(
        workspaceID()
          ? prompt().trim().length === 0
            ? "Describe the task you want the agent to perform."
            : `The prompt exceeds the ${maxChars().toLocaleString()} character limit.`
          : "Select a workspace before delegating a task.",
      )
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = await api.createTask({
        workspaceID: workspaceID(),
        prompt: prompt().trim(),
        ...(title().trim() ? { title: title().trim() } : {}),
        model: selectedModel(),
        ...(agent() ? { agent: agent() } : {}),
        approvalMode: approvalMode(),
      })
      setPrompt("")
      setTitle("")
      notify("Task queued and handed to OpenCode.")
      if (props.onCreated) props.onCreated(result.task)
      else navigate(`/tasks/${result.task.id}`)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  const onKeyDown = (event: KeyboardEvent & { currentTarget: HTMLTextAreaElement }) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      void submit()
    }
  }

  return (
    <form
      class={`composer ${props.compact ? "compact" : ""}`}
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <Show
        when={workspaces().length > 0}
        fallback={
          <div class="empty compact">
            <Icon name="folder" size={26} />
            <p>Register a workspace before delegating a task.</p>
            <a class="button subtle" href="#/workspaces">
              Add a workspace
            </a>
          </div>
        }
      >
        <div class="composer-grid">
          <label class="field">
            <span class="field-label">Workspace</span>
            <select
              class="input select"
              value={workspaceID()}
              onChange={(event) => setWorkspaceID(event.currentTarget.value)}
            >
              <For each={workspaces()}>
                {(workspace) => (
                  <option value={workspace.id}>
                    {workspace.name} · {workspace.path}
                  </option>
                )}
              </For>
            </select>
          </label>
          <label class="field">
            <span class="field-label">Model</span>
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
                          <option value={encodeModel({ providerID: provider.id, id: model.id })}>
                            {model.name}
                          </option>
                        )}
                      </For>
                    </optgroup>
                  </Show>
                )}
              </For>
            </select>
          </label>
          <label class="field">
            <span class="field-label">Agent</span>
            <select
              class="input select"
              value={agent()}
              onChange={(event) => setAgent(event.currentTarget.value)}
            >
              <Show when={agents().length === 0}>
                <option value="build">build</option>
              </Show>
              <For each={agents()}>{(entry) => <option value={entry.id}>{entry.name}</option>}</For>
            </select>
          </label>
          <label class="field">
            <span class="field-label">Approvals</span>
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
        </div>

        <label class="field">
          <span class="field-label">
            Task description
            <span class="field-hint">Ctrl/⌘ + Enter to delegate</span>
          </span>
          <textarea
            class="input textarea prompt-input"
            rows={props.compact ? 4 : 6}
            placeholder="Describe the outcome you want. Include inputs, constraints and how success should be verified."
            value={prompt()}
            onInput={(event) => setPrompt(event.currentTarget.value)}
            onKeyDown={onKeyDown}
            maxLength={maxChars()}
          />
          <span class={`field-counter ${prompt().length > maxChars() * 0.9 ? "warn" : ""}`}>
            {prompt().length.toLocaleString()} / {maxChars().toLocaleString()}
          </span>
        </label>

        <Show when={showAdvanced()}>
          <label class="field">
            <span class="field-label">Title (optional)</span>
            <input
              class="input"
              type="text"
              maxlength={160}
              placeholder="Short label for the task list"
              value={title()}
              onInput={(event) => setTitle(event.currentTarget.value)}
            />
          </label>
        </Show>

        <p class="hint">
          <Icon name="shield" size={14} />
          {APPROVAL_HINTS[approvalMode()]} Workspace paths are validated server-side.
        </p>

        <Show when={error()}>
          <p class="form-error" role="alert">
            <Icon name="alert" size={15} />
            {error()}
          </p>
        </Show>

        <div class="composer-actions">
          <button
            type="button"
            class="button ghost small"
            onClick={() => setShowAdvanced((current) => !current)}
          >
            {showAdvanced() ? "Hide title" : "Add title"}
          </button>
          <span class="spacer" />
          <button type="submit" class="button primary" disabled={!canSubmit()}>
            <Icon name="send" size={16} />
            {busy() ? "Delegating…" : "Delegate task"}
          </button>
        </div>
      </Show>
    </form>
  )
}
