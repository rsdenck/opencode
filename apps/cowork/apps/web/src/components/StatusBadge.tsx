import type { TaskStatus } from "../types"
import { STATUS_META } from "../utils"

export function StatusBadge(props: { status: TaskStatus }) {
  const meta = () => STATUS_META[props.status] ?? { label: props.status, tone: "neutral" as const }
  return (
    <span class={`badge tone-${meta().tone}`}>
      <span class="badge-dot" aria-hidden="true" />
      {meta().label}
    </span>
  )
}
