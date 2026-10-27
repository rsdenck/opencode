import { Plugin } from "@opencode/plugin"
import { driveConfig } from "./src/config.js"
import { download, invite, list, shareStatus, upload, version } from "./src/drive.js"

const text = (value: unknown) => ({ content: JSON.stringify(value, null, 2) })

const asPath = (input: unknown, fallback: string) => {
  const value = input as { path?: string }
  return value.path ?? fallback
}

export default Plugin.define({
  id: "opencode.proton.drive",
  async setup(ctx) {
    const config = () => driveConfig(ctx.options)

    await ctx.tool.transform((editor) => {
      editor.namespace({
        name: "proton_drive",
        description: "Browse, upload, download, and share files with the official Proton Drive CLI",
      })

      editor.add({
        name: "version",
        description: "Report the installed Proton Drive CLI version. Use it to check that the CLI is installed and signed in.",
        input: { type: "object", properties: {}, additionalProperties: false },
        execute: async (_input, context) => text(await version(config(), context.signal)),
      })

      editor.add({
        name: "list",
        description: "List a Proton Drive folder. Paths start at the Drive root, for example /my-files or /my-files/Documents.",
        input: {
          type: "object",
          properties: {
            path: { type: "string", description: "Remote folder path, defaults to /my-files." },
          },
          additionalProperties: false,
        },
        execute: async (input, context) => text(await list(config(), asPath(input, "/my-files"), context.signal)),
      })

      editor.add({
        name: "upload",
        description: "Upload a local file or folder to a Proton Drive folder.",
        input: {
          type: "object",
          properties: {
            local: { type: "string", description: "Local file or folder to upload." },
            remote: { type: "string", description: "Destination folder in Proton Drive, for example /my-files/Documents." },
          },
          required: ["local", "remote"],
          additionalProperties: false,
        },
        execute: async (input, context) => {
          const value = input as { local: string; remote: string }
          return text(await upload(config(), value.local, value.remote, context.signal))
        },
      })

      editor.add({
        name: "download",
        description: "Download a Proton Drive file or folder into a local directory.",
        input: {
          type: "object",
          properties: {
            remote: { type: "string", description: "Remote path to download, for example /my-files/report.pdf." },
            local: { type: "string", description: "Local destination directory." },
          },
          required: ["remote", "local"],
          additionalProperties: false,
        },
        execute: async (input, context) => {
          const value = input as { remote: string; local: string }
          return text(await download(config(), value.remote, value.local, context.signal))
        },
      })

      editor.add({
        name: "share_invite",
        description:
          "Invite a Proton account to collaborate on a Proton Drive folder or file. The role defaults to viewer.",
        input: {
          type: "object",
          properties: {
            path: { type: "string", description: "Remote path to share." },
            email: { type: "string", description: "Proton account email to invite." },
            role: {
              type: "string",
              enum: ["viewer", "editor", "admin"],
              description: "Permission granted to the invitee. Defaults to viewer.",
            },
          },
          required: ["path", "email"],
          additionalProperties: false,
        },
        execute: async (input, context) => {
          const value = input as { path: string; email: string; role?: string }
          return text(await invite(config(), value.path, value.email, value.role ?? "viewer", context.signal))
        },
      })

      editor.add({
        name: "share_status",
        description: "Show sharing state and invitations for a Proton Drive path.",
        input: {
          type: "object",
          properties: {
            path: { type: "string", description: "Remote path to inspect." },
          },
          required: ["path"],
          additionalProperties: false,
        },
        execute: async (input, context) => text(await shareStatus(config(), asPath(input, "/my-files"), context.signal)),
      })
    })
  },
})
