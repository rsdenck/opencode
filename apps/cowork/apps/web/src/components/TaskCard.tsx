import { For } from "solid-js"
import type { Task } from "../types"
import { formatDuration, formatRelative, modelLabel, PHASE_LABELS, truncate } from "../utils"
import { Icon } from "./Icons"
import { StatusBadge } from "./StatusBadge"

const PHASES = ["prepare", "analyze", "execute", "verify", "finalize"] as const

function phaseProgress(task: Task): number {
  if (task.status === "completed") return PHASES.length
  if (task.status === "queued") return 0
  const index = PHASES.indexOf(task.phase)
  return Math.max(1, index + 1)
}

export function TaskCard(props: { task: Task }) {
  const progress = () => phaseProgress(props.task)
  const active = () =>
    props.task.status === "queued" ||
    props.task.status === "planning" ||
    props.task.status === "running"

  return (
    <a
      class="task-card"
      href={`#/tasks/${props.task.id}`}
      aria-label={`Open task ${props.task.title}`}
    >
      <div class="task-card-head">
        <div class="task-card-heading">
          <h3 class="task-title">{props.task.title}</h3>
          <p class="task-prompt">{truncate(props.task.prompt.replace(/\s+/g, " ").trim(), 170)}</p>
        </div>
        <StatusBadge status={props.task.status} />
      </div>

      <div class="phase-track">
        <For each={PHASES}>
          {(phase, index) => (
            <div
              class={`phase-seg ${index() < progress() ? "done" : ""} ${
                phase === props.task.phase && active() ? "active" : ""
              }`}
              title={PHASE_LABELS[phase]}
            >
              <span>{PHASE_LABELS[phase]}</span>
            </div>
          )}
        </For>
      </div>

      <div class="task-meta">
        <span class="meta-item" title={props.task.workspacePath}>
          <Icon name="folder" size={14} />
          {props.task.workspacePath}
        </span>
        <span class="meta-item">
          <Icon name="cpu" size={14} />
          {modelLabel(props.task)}
        </span>
        <span class="meta-item">
          <Icon name="clock" size={14} />
          {formatRelative(props.task.createdAt)}
        </span>
        {props.task.finishedAt ? (
          <span class="meta-item">
            {formatDuration(props.task.startedAt, props.task.finishedAt)}
          </span>
        ) : null}
        {props.task.status === "awaiting_approval" ? (
          <span class="meta-item warn">
            <Icon name="shield" size={14} />
            Approval needed
          </span>
        ) : null}
        {props.task.resumable ? (
          <span class="meta-item warn">
            <Icon name="refresh" size={14} />
            Resumable
          </span>
        ) : null}
      </div>
    </a>
  )
}
