import { createSignal, For, Show } from "solid-js"
import type { TaskEvent } from "../types"
import { eventSummary, formatTime, jsonPreview, truncate } from "../utils"
import { Icon } from "./Icons"

type Filter = "all" | "approvals" | "tools" | "issues"

function matches(event: TaskEvent, filter: Filter): boolean {
  if (filter === "all") return true
  if (filter === "approvals") {
    return event.type.startsWith("permission.") || event.type.startsWith("approval.")
  }
  if (filter === "tools") {
    return event.type.startsWith("session.tool.") || event.type === "session.step.started"
  }
  return (
    event.type.endsWith(".failed") || event.type === "task.failed" || event.type === "task.warning"
  )
}

export function EventList(props: { events: TaskEvent[]; maxHeight?: boolean }) {
  const [filter, setFilter] = createSignal<Filter>("all")

  const visible = () =>
    props.events
      .filter((event) => matches(event, filter()))
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt || b.seq - a.seq)
      .slice(0, 300)

  const isError = (type: string) => type.endsWith(".failed") || type === "task.failed"

  return (
    <div class={`event-panel ${props.maxHeight ? "scroll" : ""}`}>
      {/* biome-ignore lint/a11y/useSemanticElements: a group of toggle buttons is a valid ARIA group */}
      <div class="chips" role="group" aria-label="Event filters">
        <For
          each={[
            { value: "all" as const, label: "All" },
            { value: "approvals" as const, label: "Approvals" },
            { value: "tools" as const, label: "Tools" },
            { value: "issues" as const, label: "Issues" },
          ]}
        >
          {(option) => (
            <button
              type="button"
              class={`chip ${filter() === option.value ? "active" : ""}`}
              onClick={() => setFilter(option.value)}
            >
              {option.label}
            </button>
          )}
        </For>
        <span class="chip-count">{props.events.length} events</span>
      </div>

      <Show
        when={visible().length > 0}
        fallback={<p class="muted small">No events match this filter yet.</p>}
      >
        <ol class="event-list">
          <For each={visible()}>
            {(event) => {
              const summary = () => eventSummary(event)
              return (
                <li class={`event-row ${isError(event.type) ? "is-error" : ""}`}>
                  <span class="event-marker" aria-hidden="true">
                    <Icon
                      name={
                        isError(event.type)
                          ? "alert"
                          : event.type.startsWith("permission.")
                            ? "shield"
                            : event.type.startsWith("session.tool.")
                              ? "terminal"
                              : "activity"
                      }
                      size={13}
                    />
                  </span>
                  <div class="event-body">
                    <div class="event-line">
                      <span class="event-title">{summary().title}</span>
                      <span class="event-time">{formatTime(event.createdAt)}</span>
                    </div>
                    <Show when={summary().detail}>
                      <p class="event-detail">{truncate(summary().detail as string, 500)}</p>
                    </Show>
                    <details class="event-raw">
                      <summary>Raw event · {event.type}</summary>
                      <pre class="code-block">{jsonPreview(event.payload, 4000)}</pre>
                    </details>
                  </div>
                </li>
              )
            }}
          </For>
        </ol>
      </Show>
    </div>
  )
}
