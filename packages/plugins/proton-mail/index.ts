import { Plugin } from "@opencode/plugin"
import { bridgeConfig } from "./src/config.js"
import { listFolders, listMessages, readMessage, searchMessages, sendMessage } from "./src/mail.js"

const text = (value: unknown) => ({ content: JSON.stringify(value, null, 2) })

const asList = (input: unknown) => {
  const value = input as { mailbox?: string; limit?: number; unread?: boolean }
  return { mailbox: value.mailbox ?? "INBOX", limit: value.limit ?? 20, unread: value.unread ?? false }
}

const asRead = (input: unknown) => {
  const value = input as { mailbox?: string; uid: number }
  return { mailbox: value.mailbox ?? "INBOX", uid: value.uid }
}

const asSearch = (input: unknown) => {
  const value = input as { mailbox?: string; query: string; limit?: number }
  return { mailbox: value.mailbox ?? "INBOX", query: value.query, limit: value.limit ?? 20 }
}

const asSend = (input: unknown) => {
  const value = input as {
    to: string[]
    subject: string
    text: string
    html?: string
    cc?: string[]
    bcc?: string[]
    replyTo?: string
    inReplyTo?: string
    references?: string[]
  }
  return {
    to: value.to,
    subject: value.subject,
    text: value.text,
    html: value.html,
    cc: value.cc,
    bcc: value.bcc,
    replyTo: value.replyTo,
    inReplyTo: value.inReplyTo,
    references: value.references,
  }
}

export default Plugin.define({
  id: "opencode.proton.mail",
  async setup(ctx) {
    const config = () => bridgeConfig(ctx.options)

    await ctx.tool.transform((editor) => {
      editor.namespace({
        name: "proton_mail",
        description: "Read, search, and send Proton Mail through a local Proton Mail Bridge",
      })

      editor.add({
        name: "folders",
        description: "List the Proton Mail folders and labels that Proton Mail Bridge exposes to this account.",
        input: { type: "object", properties: {}, additionalProperties: false },
        execute: async () => text(await listFolders(config())),
      })

      editor.add({
        name: "list",
        description:
          "List recent messages in a Proton Mail folder, newest first. Returns UIDs for use with proton_mail_read.",
        input: {
          type: "object",
          properties: {
            mailbox: { type: "string", description: "Folder path, for example INBOX or Folders/Receipts." },
            limit: { type: "integer", minimum: 1, maximum: 100, description: "Maximum messages to return." },
            unread: { type: "boolean", description: "Only return unread messages." },
          },
          additionalProperties: false,
        },
        execute: async (input) => text(await listMessages(config(), asList(input))),
      })

      editor.add({
        name: "search",
        description:
          "Search a Proton Mail folder across headers and body text. Returns UIDs for use with proton_mail_read.",
        input: {
          type: "object",
          properties: {
            query: { type: "string", description: "Text to search for." },
            mailbox: { type: "string", description: "Folder path, defaults to INBOX." },
            limit: { type: "integer", minimum: 1, maximum: 100, description: "Maximum messages to return." },
          },
          required: ["query"],
          additionalProperties: false,
        },
        execute: async (input) => text(await searchMessages(config(), asSearch(input))),
      })

      editor.add({
        name: "read",
        description:
          "Read one message by UID, including its plain text body, HTML body, and attachment metadata. Does not download attachment contents.",
        input: {
          type: "object",
          properties: {
            uid: { type: "integer", minimum: 1, description: "Message UID from proton_mail_list or proton_mail_search." },
            mailbox: { type: "string", description: "Folder path, defaults to INBOX." },
          },
          required: ["uid"],
          additionalProperties: false,
        },
        execute: async (input) => text(await readMessage(config(), asRead(input))),
      })

      editor.add({
        name: "send",
        description:
          "Send a message through Proton Mail Bridge. The sender is the Bridge account; pass reply headers to continue a thread.",
        input: {
          type: "object",
          properties: {
            to: { type: "array", items: { type: "string" }, minItems: 1, description: "Recipient addresses." },
            subject: { type: "string" },
            text: { type: "string", description: "Plain text body." },
            html: { type: "string", description: "Optional HTML body." },
            cc: { type: "array", items: { type: "string" } },
            bcc: { type: "array", items: { type: "string" } },
            replyTo: { type: "string" },
            inReplyTo: { type: "string", description: "Message-ID being replied to." },
            references: { type: "array", items: { type: "string" } },
          },
          required: ["to", "subject", "text"],
          additionalProperties: false,
        },
        execute: async (input) => text(await sendMessage(config(), asSend(input))),
      })
    })
  },
})
