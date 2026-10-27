# Proton Mail

Read, search, and send Proton Mail from OpenCode through [Proton Mail Bridge](https://proton.me/mail/bridge).

Proton Mail has no public mail API, and messages are end-to-end encrypted. Bridge runs on the same machine, decrypts
locally, and exposes standard IMAP and SMTP on loopback, which is what this plugin uses. Bridge must be installed,
running, and signed in.

## Requirements

- Proton Mail Bridge running on the same machine as the OpenCode server.
- A paid Proton plan (Bridge is not available on the free plan).
- The IMAP/SMTP credentials Bridge generates. These are **not** your Proton account password. Open Bridge, select the
  account, and copy the username and password from the email client configuration panel.

## Configure

```jsonc title="~/.config/opencode/opencode.jsonc"
{
  "plugins": [
    {
      "package": "@opencode/plugin-proton-mail",
      "options": {
        "user": "you@proton.me",
        "password": "<bridge password>",
      },
    },
  ],
}
```

Everything can also come from the environment, which keeps the password out of the config file:

| Option              | Environment variable                | Default     |
| ------------------- | ----------------------------------- | ----------- |
| `user`              | `PROTON_BRIDGE_USER`                | required    |
| `password`          | `PROTON_BRIDGE_PASSWORD`            | required    |
| `host`              | `PROTON_BRIDGE_HOST`                | `127.0.0.1` |
| `imapPort`          | `PROTON_BRIDGE_IMAP_PORT`           | `1143`      |
| `smtpPort`          | `PROTON_BRIDGE_SMTP_PORT`           | `1025`      |
| `rejectUnauthorized`| `PROTON_BRIDGE_REJECT_UNAUTHORIZED` | `false`     |

Bridge serves IMAP on 1143 and SMTP on 1025 using STARTTLS. Its certificate is local and self-signed, so certificate
verification is off unless you enable it.

## Tools

| Tool                  | Purpose                                                        |
| --------------------- | -------------------------------------------------------------- |
| `proton_mail_folders` | List folders and labels.                                       |
| `proton_mail_list`    | List recent messages, newest first, optionally unread only.     |
| `proton_mail_search`  | Search headers and body text in a folder.                      |
| `proton_mail_read`    | Read a message by UID, including body and attachment metadata. |
| `proton_mail_send`    | Send a message, optionally as a reply in a thread.             |

Example prompt: "Check my unread Proton Mail, summarize anything from my accountant, and draft replies."

## Limitations

- Attachment contents are not downloaded; only filename, content type, and size are reported.
- Sending uses the Bridge account as the sender. Aliases need to be configured in Bridge first.
- Every operation opens a Bridge connection and closes it again, so the plugin stays idle when Bridge is offline.
