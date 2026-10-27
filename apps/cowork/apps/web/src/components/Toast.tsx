import { Show } from "solid-js"
import { setToast, toast } from "../store"
import { Icon } from "./Icons"

export function Toast() {
  return (
    <Show when={toast()}>
      {(entry) => (
        <div class={`toast ${entry().tone}`} role="status" aria-live="polite">
          <Icon name={entry().tone === "error" ? "alert" : "check"} size={16} />
          <span>{entry().message}</span>
          <button
            type="button"
            class="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setToast(null)}
          >
            <Icon name="x" size={14} />
          </button>
        </div>
      )}
    </Show>
  )
}
