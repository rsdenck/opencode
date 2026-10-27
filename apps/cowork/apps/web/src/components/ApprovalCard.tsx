import { createSignal, For, Show } from "solid-js"
import { errorMessage } from "../store"
import type { Approval, Decision } from "../types"
import { approvalDiffs, formatRelative, jsonPreview } from "../utils"
import { Icon } from "./Icons"

export function ApprovalCard(props: {
  approval: Approval
  onReply: (decision: Decision, message?: string) => Promise<void>
}) {
  const [busy, setBusy] = createSignal<Decision | null>(null)
  const [message, setMessage] = createSignal("")
  const [error, setError] = createSignal<string | null>(null)
  const [showMessage, setShowMessage] = createSignal(false)
  const pending = () => props.approval.status === "pending"
  const diffs = () => approvalDiffs(props.approval)

  const reply = async (decision: Decision) => {
    setBusy(decision)
    setError(null)
    try {
      await props.onReply(decision, message().trim() || undefined)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(null)
    }
  }

  return (
    <article class={`approval-card ${pending() ? "pending" : `resolved-${props.approval.status}`}`}>
      <header class="approval-head">
        <span class="approval-icon">
          <Icon name={pending() ? "shield" : "check"} size={18} />
        </span>
        <div class="approval-heading">
          <div class="approval-title">
            {pending() ? "Approval requested" : `Approval ${props.approval.status}`}
            <span class="approval-action">{props.approval.action}</span>
          </div>
          <span class="approval-time">{formatRelative(props.approval.createdAt)}</span>
        </div>
        <Show when={!pending()}>
          <span class={`badge tone-${props.approval.status === "approved" ? "success" : "danger"}`}>
            {props.approval.status}
          </span>
        </Show>
      </header>

      <Show when={props.approval.resources.length > 0}>
        <div class="resource-list">
          <For each={props.approval.resources}>
            {(resource) => (
              <code class="resource" title={resource}>
                {resource}
              </code>
            )}
          </For>
        </div>
      </Show>

      <Show when={diffs().length > 0}>
        <div class="approval-diffs">
          <For each={diffs()}>
            {(diff) => (
              <details class="approval-diff" open={diffs().length === 1}>
                <summary>
                  <Icon name="file" size={14} />
                  {diff.file}
                  <span class="muted small"> · {diff.status}</span>
                </summary>
                <pre class="code-block diff-block">{diff.patch}</pre>
              </details>
            )}
          </For>
        </div>
      </Show>

      <details class="approval-meta">
        <summary>Request details</summary>
        <pre class="code-block">{jsonPreview(props.approval.metadata, 3000)}</pre>
      </details>

      <Show when={pending()}>
        <Show when={showMessage()}>
          <label class="field">
            <span class="field-label">Message to the agent (optional)</span>
            <textarea
              class="input textarea small"
              rows={2}
              value={message()}
              placeholder="Explain your decision or give guidance…"
              onInput={(event) => setMessage(event.currentTarget.value)}
            />
          </label>
        </Show>

        <Show when={error()}>
          <p class="form-error" role="alert">
            <Icon name="alert" size={14} />
            {error()}
          </p>
        </Show>

        <div class="approval-actions">
          <button
            type="button"
            class="button primary"
            disabled={busy() !== null}
            onClick={() => void reply("once")}
          >
            <Icon name="check" size={15} />
            {busy() === "once" ? "Approving…" : "Approve once"}
          </button>
          <button
            type="button"
            class="button subtle"
            disabled={busy() !== null}
            onClick={() => void reply("always")}
          >
            {busy() === "always" ? "Saving…" : "Always allow"}
          </button>
          <button
            type="button"
            class="button danger"
            disabled={busy() !== null}
            onClick={() => void reply("reject")}
          >
            <Icon name="x" size={15} />
            {busy() === "reject" ? "Rejecting…" : "Reject"}
          </button>
          <button
            type="button"
            class="button ghost small"
            onClick={() => setShowMessage((current) => !current)}
          >
            {showMessage() ? "Hide message" : "Add message"}
          </button>
        </div>
      </Show>

      <Show when={!pending() && props.approval.message}>
        <p class="approval-message">
          <strong>Message:</strong> {props.approval.message}
        </p>
      </Show>
    </article>
  )
}
