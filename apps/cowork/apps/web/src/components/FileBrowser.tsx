import { createEffect, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { api } from "../api"
import { errorMessage } from "../store"
import type { DirectoryListing } from "../types"
import { formatBytes, formatRelative } from "../utils"
import { Icon } from "./Icons"

export function FilePreview(props: { workspaceID: string; path: string; onClose: () => void }) {
  const [content, setContent] = createSignal<string | null>(null)
  const [size, setSize] = createSignal(0)
  const [binary, setBinary] = createSignal(false)
  const [loading, setLoading] = createSignal(true)
  const [error, setError] = createSignal<string | null>(null)

  createEffect(() => {
    const { workspaceID: workspace, path } = props
    if (!workspace || !path) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setContent(null)
    api
      .readFile(workspace, path)
      .then((file) => {
        if (cancelled) return
        setContent(file.content)
        setSize(file.size)
        setBinary(file.binary)
      })
      .catch((caught) => {
        if (!cancelled) setError(errorMessage(caught))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    onCleanup(() => {
      cancelled = true
    })
  })

  onMount(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") props.onClose()
    }
    window.addEventListener("keydown", handler)
    onCleanup(() => window.removeEventListener("keydown", handler))
  })

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop click closes the modal
    <div class="modal-backdrop" role="presentation" onClick={() => props.onClose()}>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: click only stops backdrop propagation */}
      <div
        class="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label={`Preview ${props.path}`}
        onClick={(event) => event.stopPropagation()}
      >
        <header class="modal-header">
          <div>
            <p class="eyebrow">File preview</p>
            <h2 class="modal-title">{props.path}</h2>
            <p class="muted small">{formatBytes(size())} · read-only view from the workspace</p>
          </div>
          <button
            type="button"
            class="icon-button"
            aria-label="Close preview"
            onClick={props.onClose}
          >
            <Icon name="x" size={18} />
          </button>
        </header>
        <div class="modal-body">
          <Show when={loading()}>
            <p class="muted">Loading file…</p>
          </Show>
          <Show when={error()}>
            <p class="form-error">
              <Icon name="alert" size={15} />
              {error()}
            </p>
          </Show>
          <Show when={!loading() && !error() && binary()}>
            <div class="empty compact">
              <Icon name="file" size={24} />
              <p>This file appears to be binary and cannot be previewed as text.</p>
            </div>
          </Show>
          <Show when={!loading() && !error() && !binary()}>
            <pre class="code-block file-preview">{content() ?? ""}</pre>
          </Show>
        </div>
      </div>
    </div>
  )
}

export function FileBrowser(props: { workspaceID: string }) {
  const [path, setPath] = createSignal("")
  const [listing, setListing] = createSignal<DirectoryListing | null>(null)
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  const [preview, setPreview] = createSignal<string | null>(null)
  const [refresh, setRefresh] = createSignal(0)

  createEffect(() => {
    const workspace = props.workspaceID
    const requested = path()
    refresh()
    if (!workspace) return
    let cancelled = false
    setLoading(true)
    setError(null)
    api
      .listFiles(workspace, requested)
      .then((result) => {
        if (!cancelled) setListing(result)
      })
      .catch((caught) => {
        if (!cancelled) setError(errorMessage(caught))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    onCleanup(() => {
      cancelled = true
    })
  })

  const crumbs = () => {
    const segments = path()
      .split("/")
      .filter((segment) => segment.length > 0)
    const result: Array<{ label: string; path: string }> = []
    let current = ""
    for (const segment of segments) {
      current = current ? `${current}/${segment}` : segment
      result.push({ label: segment, path: current })
    }
    return result
  }

  const parent = () => {
    const parts = path()
      .split("/")
      .filter((segment) => segment.length > 0)
    parts.pop()
    return parts.join("/")
  }

  return (
    <div class="file-browser">
      <nav class="breadcrumbs" aria-label="Current directory">
        <button type="button" class="crumb" onClick={() => setPath("")}>
          <Icon name="folder" size={14} />
          root
        </button>
        <For each={crumbs()}>
          {(crumb) => (
            <>
              <span class="crumb-sep">/</span>
              <button type="button" class="crumb" onClick={() => setPath(crumb.path)}>
                {crumb.label}
              </button>
            </>
          )}
        </For>
        <span class="spacer" />
        <button
          type="button"
          class="icon-button"
          aria-label="Refresh directory"
          onClick={() => setRefresh((value) => value + 1)}
        >
          <Icon name="refresh" size={15} />
        </button>
      </nav>

      <Show when={loading()}>
        <p class="muted small">Loading directory…</p>
      </Show>
      <Show when={error()}>
        <p class="form-error">
          <Icon name="alert" size={15} />
          {error()}
        </p>
      </Show>

      <Show when={!error()}>
        <ul class="file-list">
          <Show when={path() !== ""}>
            <li>
              <button type="button" class="file-row" onClick={() => setPath(parent())}>
                <span class="file-icon">
                  <Icon name="arrowLeft" size={16} />
                </span>
                <span class="file-name">..</span>
                <span class="file-size">parent directory</span>
              </button>
            </li>
          </Show>
          <For each={listing()?.entries ?? []}>
            {(entry) => (
              <li>
                <button
                  type="button"
                  class={`file-row ${entry.type}`}
                  disabled={entry.type !== "directory" && entry.type !== "file"}
                  onClick={() => {
                    if (entry.type === "directory") setPath(entry.path)
                    else if (entry.type === "file") setPreview(entry.path)
                  }}
                >
                  <span class="file-icon">
                    <Icon name={entry.type === "directory" ? "folder" : "file"} size={16} />
                  </span>
                  <span class="file-name">{entry.name}</span>
                  <span class="file-size">
                    {entry.type === "directory" ? "directory" : formatBytes(entry.size)}
                  </span>
                  <span class="file-time">{formatRelative(entry.mtime)}</span>
                </button>
              </li>
            )}
          </For>
        </ul>
        <Show when={!loading() && (listing()?.entries.length ?? 0) === 0}>
          <p class="muted small">This directory is empty.</p>
        </Show>
        <Show when={listing()?.truncated}>
          <p class="muted small">Listing truncated by the configured file limit.</p>
        </Show>
      </Show>

      <Show when={preview()}>
        {(file) => (
          <FilePreview
            workspaceID={props.workspaceID}
            path={file()}
            onClose={() => setPreview(null)}
          />
        )}
      </Show>
    </div>
  )
}
