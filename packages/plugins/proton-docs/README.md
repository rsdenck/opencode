# Proton Docs

Find and describe [Proton Docs](https://proton.me/drive/docs) documents stored in Proton Drive.

Proton Docs are end-to-end encrypted Drive nodes with the media type `application/vnd.proton.doc`. They appear in folder
listings like any other file, but Proton treats their content specially: the official Drive SDK **refuses to download
them** (`Docs or Sheets are not supported in takeout`), and there is no public API to read or edit a document.

This plugin therefore does what is honestly possible today: it catalogs documents, reports their metadata and sharing
state, and hands back the exact export path Proton supports. It cannot read or write document content.

## Requirements

Same as the [Proton Drive](../proton-drive/README.md) plugin:

1. The [Proton Drive CLI](https://proton.me/drive/download) on `PATH` (or the `binary` option / `PROTON_DRIVE_BIN`).
2. `proton-drive auth login` run once, so the CLI has a stored session.

## Configure

```jsonc title="~/.config/opencode/opencode.jsonc"
{
  "plugins": ["@opencode/plugin-proton-docs"],
}
```

| Option      | Environment variable | Default        |
| ----------- | -------------------- | -------------- |
| `binary`    | `PROTON_DRIVE_BIN`   | `proton-drive` |
| `timeoutMs` | —                    | `120000`       |

## Tools

| Tool                | Purpose                                                                    |
| ------------------- | -------------------------------------------------------------------------- |
| `proton_docs_list`  | List documents under a Drive path, walking up to 5 folder levels.          |
| `proton_docs_info`  | Metadata for one document, plus the formats Proton exports it to.          |

```json
{ "path": "/my-files", "depth": 3, "text": "roadmap" }
```

`proton_docs_info` returns, for example:

```json
{
  "name": "Notes",
  "path": "/my-files/Notes",
  "uid": "f1",
  "sizeBytes": 1234,
  "shared": true,
  "export": {
    "formats": ["docx", "html", "txt", "md", "pdf"],
    "howTo": "Open the document in Proton Drive, use the ⋮ menu to open it in Docs, then File → Download."
  }
}
```

Example prompt: "Which Proton Docs mention the roadmap, and which of them are shared?"

## Limitations

- **No content access.** Proton Docs content can only be read or edited in Proton's own apps. Export via the web UI is
  the only supported path, in `.docx`, `.html`, `.txt`, `.md`, or `.pdf` form.
- Documents that live in **shared-with-me** or **trash** sections are found only if you point the list tool at a path
  inside those sections (`/shared-with-me`, `/trash`).
- Folder walks are capped at 20,000 nodes per call and results at 500 documents; output reports `truncated` when a cap
  hits.
