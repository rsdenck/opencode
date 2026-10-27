# Proton Drive

Browse, upload, download, and share Proton Drive files from OpenCode using the [official Proton Drive CLI](https://proton.me/drive/download).

Proton Drive has no public HTTP API. Proton ships a first-party CLI built on the Drive SDK that handles authentication
and client-side encryption; this plugin drives that binary instead of reimplementing the protocol.

## Requirements

1. Download the Proton Drive CLI for your platform from [proton.me/drive/download](https://proton.me/drive/download).
2. Make it executable and put it on `PATH`:

   ```sh
   chmod +x proton-drive
   sudo mv proton-drive /usr/local/bin/
   proton-drive version
   ```

3. Sign in once, in a browser session on the same machine:

   ```sh
   proton-drive auth login
   ```

   The session is stored in the OS secret store (libsecret on Linux, Keychain on macOS), so the plugin never sees a
   password.

## Configure

The plugin needs no options when `proton-drive` is on `PATH`:

```jsonc title="~/.config/opencode/opencode.jsonc"
{
  "plugins": ["@opencode/plugin-proton-drive"],
}
```

| Option                    | Environment variable | Default        |
| ------------------------- | -------------------- | -------------- |
| `binary`                  | `PROTON_DRIVE_BIN`   | `proton-drive` |
| `timeoutMs`               | —                    | `120000`       |
| `fileConflictStrategy`    | —                    | `rename`       |
| `folderConflictStrategy`  | —                    | `rename`       |
| `skipThumbnails`          | —                    | `true`         |

`fileConflictStrategy` accepts the CLI's own values: `rename`, `skip`, `replace`, `remove`, or `create-new-revision`.
`folderConflictStrategy` accepts `rename`, `merge`, `skip`, or `remove`. They default to `rename` because the CLI
otherwise asks on stdin how to resolve a name collision, which a tool call cannot answer.

## Tools

| Tool                     | Purpose                                                  |
| ------------------------ | -------------------------------------------------------- |
| `proton_drive_version`   | Check that the CLI is installed and reachable.           |
| `proton_drive_list`      | List a Drive folder.                                     |
| `proton_drive_upload`    | Upload a local file or folder.                            |
| `proton_drive_download`  | Download a Drive file or folder into a local directory.  |
| `proton_drive_share_invite` | Invite a Proton account to a file or folder.          |
| `proton_drive_share_status` | Show sharing state for a path.                        |

Paths start at the Drive root, for example `/my-files/Documents`. Commands run with `--json`; if the installed CLI
prints human-readable output instead, the raw text is returned. Each invocation closes its own session, so the plugin
adds no background process.

Example prompt: "Upload the release notes in ./dist to Proton Drive under /my-files/Releases and share the folder with
ana@proton.me."

## Limitations

- The CLI runs as the user that started the OpenCode server and uses that user's stored session.
- `auth login` is browser-based, so it is not exposed as a tool. Run it once from a terminal.
- Photos and albums commands are not wrapped yet; the CLI supports them for manual use.
- A missing binary or signed-out session produces the CLI's own error message rather than a silent failure.
