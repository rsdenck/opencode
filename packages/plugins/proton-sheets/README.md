# Proton Sheets

Find and describe [Proton Sheets](https://proton.me/drive/sheets) spreadsheets stored in Proton Drive.

Proton Sheets are end-to-end encrypted Drive nodes with the media type `application/vnd.proton.sheet`. They appear in
folder listings like any other file, but Proton treats their content specially: the official Drive SDK **refuses to
download them** (`Docs or Sheets are not supported in takeout`), and there is no public API to read or edit a
spreadsheet.

This plugin therefore does what is honestly possible today: it catalogs spreadsheets, reports their metadata and
sharing state, and hands back the exact export path Proton supports. It cannot read or write spreadsheet content.

## Requirements

Same as the [Proton Drive](../proton-drive/README.md) plugin:

1. The [Proton Drive CLI](https://proton.me/drive/download) on `PATH` (or the `binary` option / `PROTON_DRIVE_BIN`).
2. `proton-drive auth login` run once, so the CLI has a stored session.

## Configure

```jsonc title="~/.config/opencode/opencode.jsonc"
{
  "plugins": ["@opencode/plugin-proton-sheets"],
}
```

| Option      | Environment variable | Default        |
| ----------- | -------------------- | -------------- |
| `binary`    | `PROTON_DRIVE_BIN`   | `proton-drive` |
| `timeoutMs` | —                    | `120000`       |

## Tools

| Tool                  | Purpose                                                                       |
| --------------------- | ----------------------------------------------------------------------------- |
| `proton_sheets_list`  | List spreadsheets under a Drive path, walking up to 5 folder levels.          |
| `proton_sheets_info`  | Metadata for one spreadsheet, plus the formats Proton exports it to.          |

```json
{ "path": "/my-files", "depth": 3, "text": "budget" }
```

`proton_sheets_info` returns, for example:

```json
{
  "name": "Budget",
  "path": "/my-files/Finance/Budget",
  "uid": "s1",
  "sizeBytes": 987,
  "shared": false,
  "export": {
    "formats": ["xlsx", "csv", "tsv", "ods"],
    "howTo": "Open the spreadsheet in Proton Drive, then File → Download."
  }
}
```

Example prompt: "List my Proton Sheets spreadsheets and tell me which ones I shared."

## Limitations

- **No content access.** Proton Sheets content can only be read or edited in Proton's own apps. Export via the web UI is
  the only supported path, in `.xlsx`, `.csv`, `.tsv`, or `.ods` (beta) form.
- Spreadsheets in **shared-with-me** or **trash** sections are found only if you point the list tool at a path inside
  those sections (`/shared-with-me`, `/trash`).
- Folder walks are capped at 20,000 nodes per call and results at 500 spreadsheets; output reports `truncated` when a
  cap hits.
