import { For, Show } from "solid-js"
import type { Artifact } from "../types"
import { formatBytes, formatRelative } from "../utils"
import { Icon } from "./Icons"

const CHANGE_LABEL: Record<Artifact["change"], string> = {
  created: "Created",
  modified: "Modified",
  deleted: "Deleted",
}

export function ArtifactTable(props: { artifacts: Artifact[]; onOpen?: (path: string) => void }) {
  return (
    <Show
      when={props.artifacts.length > 0}
      fallback={
        <div class="empty compact">
          <Icon name="file" size={22} />
          <p>No file changes detected for this task yet.</p>
        </div>
      }
    >
      <div class="table-wrap">
        <table class="data-table artifact-table">
          <thead>
            <tr>
              <th scope="col">Path</th>
              <th scope="col">Change</th>
              <th scope="col">Size</th>
              <th scope="col">Updated</th>
              <th scope="col">
                <span class="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <For each={props.artifacts}>
              {(artifact) => (
                <tr>
                  <td>
                    <button
                      type="button"
                      class="link-button path-button"
                      title={artifact.path}
                      onClick={() => props.onOpen?.(artifact.path)}
                    >
                      <Icon name="file" size={14} />
                      <span>{artifact.path}</span>
                    </button>
                  </td>
                  <td>
                    <span class={`change-tag change-${artifact.change}`}>
                      {CHANGE_LABEL[artifact.change]}
                    </span>
                  </td>
                  <td class="numeric">{formatBytes(artifact.size)}</td>
                  <td class="numeric">{formatRelative(artifact.mtime)}</td>
                  <td class="numeric">
                    <Show when={props.onOpen && artifact.change !== "deleted"}>
                      <button
                        type="button"
                        class="icon-button"
                        aria-label={`Preview ${artifact.path}`}
                        onClick={() => props.onOpen?.(artifact.path)}
                      >
                        <Icon name="external" size={15} />
                      </button>
                    </Show>
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
    </Show>
  )
}
