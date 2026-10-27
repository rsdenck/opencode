import { For, Show } from "solid-js"
import type { TaskStep } from "../types"
import { formatDuration, formatTime, PHASE_LABELS } from "../utils"
import { Icon } from "./Icons"

const ICON_FOR_STATUS: Record<TaskStep["status"], "check" | "clock" | "x" | "play" | "square"> = {
  completed: "check",
  running: "play",
  failed: "x",
  pending: "clock",
  skipped: "square",
}

export function Timeline(props: { steps: TaskStep[] }) {
  return (
    <Show
      when={props.steps.length > 0}
      fallback={<p class="muted">No execution steps recorded yet.</p>}
    >
      <ol class="timeline">
        <For each={props.steps}>
          {(step, index) => (
            <li class={`timeline-item status-${step.status}`}>
              <div class="timeline-rail">
                <span class={`timeline-dot ${step.status}`}>
                  <Icon name={ICON_FOR_STATUS[step.status]} size={12} />
                </span>
                <Show when={index() < props.steps.length - 1}>
                  <span class="timeline-line" />
                </Show>
              </div>
              <div class="timeline-content">
                <div class="timeline-head">
                  <span class="timeline-phase">{PHASE_LABELS[step.phase] ?? step.phase}</span>
                  <span class="timeline-title">{step.title}</span>
                  <span class={`timeline-state ${step.status}`}>{step.status}</span>
                </div>
                <div class="timeline-meta">
                  <Show when={step.startedAt}>
                    <span>Started {formatTime(step.startedAt as number)}</span>
                  </Show>
                  <Show when={step.finishedAt}>
                    <span>{formatDuration(step.startedAt, step.finishedAt)}</span>
                  </Show>
                  <Show when={step.detail}>
                    <span class="timeline-detail">{step.detail}</span>
                  </Show>
                </div>
              </div>
            </li>
          )}
        </For>
      </ol>
    </Show>
  )
}
