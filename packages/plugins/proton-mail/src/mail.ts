import { ImapFlow } from "imapflow"
import { simpleParser } from "mailparser"
import type { AddressObject } from "mailparser"
import nodemailer from "nodemailer"
import type { BridgeConfig } from "./config.js"

export interface Folder {
  path: string
  name: string
  specialUse?: string
  delimiter?: string
}

export interface MessageSummary {
  uid: number
  subject: string
  from: string[]
  to: string[]
  date: string | null
  flags: string[]
  size: number | null
  unread: boolean
}

export interface Message extends MessageSummary {
  cc: string[]
  messageID: string | null
  text: string
  html: string | null
  attachments: {
    filename: string | null
    contentType: string
    size: number
  }[]
}

export interface ListInput {
  mailbox: string
  limit: number
  unread: boolean
}

export interface ReadInput {
  mailbox: string
  uid: number
}

export interface SearchInput {
  mailbox: string
  query: string
  limit: number
}

export interface SendInput {
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

const formatAddress = (address: { name?: string; address?: string }) =>
  address.name ? `${address.name} <${address.address}>` : (address.address ?? "")

// IMAP envelope headers arrive as a flat array.
const formatEnvelope = (addresses: readonly { name?: string; address?: string }[] | undefined) =>
  (addresses ?? []).map(formatAddress).filter((address) => address.length > 0)

// mailparser groups parsed header addresses under value, and returns a single
// group object when a field holds one address.
const formatGrouped = (value: AddressObject | AddressObject[] | undefined) =>
  (value === undefined ? [] : Array.isArray(value) ? value : [value])
    .flatMap((group) => group.value)
    .map(formatAddress)
    .filter((address) => address.length > 0)

const summarize = (message: {
  uid: number
  envelope?: {
    subject?: string
    from?: readonly { name?: string; address?: string }[]
    to?: readonly { name?: string; address?: string }[]
    date?: Date
  }
  flags?: Set<string>
  size?: number
}): MessageSummary => {
  const flags = [...(message.flags ?? [])]
  return {
    uid: message.uid,
    subject: message.envelope?.subject ?? "",
    from: formatEnvelope(message.envelope?.from),
    to: formatEnvelope(message.envelope?.to),
    date: message.envelope?.date?.toISOString() ?? null,
    flags,
    size: message.size ?? null,
    unread: !flags.includes("\\Seen"),
  }
}

async function withClient<T>(config: BridgeConfig, run: (client: ImapFlow) => Promise<T>): Promise<T> {
  const client = new ImapFlow({
    host: config.host,
    port: config.imapPort,
    secure: false,
    auth: { user: config.user, pass: config.password },
    tls: { rejectUnauthorized: config.rejectUnauthorized },
    logger: false,
  })

  await client.connect()
  try {
    return await run(client)
  } finally {
    // Bridge may already have dropped the connection, which is not an error here.
    await client.logout().catch(() => undefined)
  }
}

export async function listFolders(config: BridgeConfig): Promise<Folder[]> {
  return withClient(config, async (client) => {
    const mailboxes = await client.list()
    return mailboxes.map((mailbox) => ({
      path: mailbox.path,
      name: mailbox.name,
      specialUse: mailbox.specialUse,
      delimiter: mailbox.delimiter,
    }))
  })
}

export async function listMessages(config: BridgeConfig, input: ListInput): Promise<MessageSummary[]> {
  return withClient(config, async (client) => {
    await client.mailboxOpen(input.mailbox)
    const uids = await client.search(input.unread ? { seen: false } : { all: true }, { uid: true })
    if (!uids || uids.length === 0) return []

    const messages: MessageSummary[] = []
    // Newest first: the tail of a UID list is the most recent mail.
    const selected = uids.slice(-input.limit).reverse()
    for await (const message of client.fetch(
      selected,
      { envelope: true, flags: true, internalDate: true, size: true },
      { uid: true },
    )) {
      messages.push(summarize(message))
    }
    return messages
  })
}

export async function searchMessages(config: BridgeConfig, input: SearchInput): Promise<MessageSummary[]> {
  return withClient(config, async (client) => {
    await client.mailboxOpen(input.mailbox)
    const uids = await client.search(
      { or: [{ subject: input.query }, { from: input.query }, { to: input.query }, { body: input.query }] },
      { uid: true },
    )
    if (!uids || uids.length === 0) return []

    const messages: MessageSummary[] = []
    const selected = uids.slice(-input.limit).reverse()
    for await (const message of client.fetch(
      selected,
      { envelope: true, flags: true, internalDate: true, size: true },
      { uid: true },
    )) {
      messages.push(summarize(message))
    }
    return messages
  })
}

export async function readMessage(config: BridgeConfig, input: ReadInput): Promise<Message> {
  return withClient(config, async (client) => {
    await client.mailboxOpen(input.mailbox)
    const message = await client.fetchOne(input.uid, { source: true, envelope: true, flags: true, size: true }, { uid: true })
    if (!message || !message.source) throw new Error(`Message ${input.uid} was not found in ${input.mailbox}.`)

    const parsed = await simpleParser(message.source)
    const summary = summarize({ ...message, uid: input.uid })
    return {
      ...summary,
      cc: formatGrouped(parsed.cc),
      messageID: parsed.messageId ?? null,
      text: parsed.text ?? "",
      html: typeof parsed.html === "string" ? parsed.html : null,
      attachments: parsed.attachments.map((attachment) => ({
        filename: attachment.filename ?? null,
        contentType: attachment.contentType,
        size: attachment.size,
      })),
    }
  })
}

export async function sendMessage(
  config: BridgeConfig,
  input: SendInput,
): Promise<{ messageID: string; accepted: string[]; rejected: string[] }> {
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.smtpPort,
    secure: false,
    requireTLS: true,
    auth: { user: config.user, pass: config.password },
    tls: { rejectUnauthorized: config.rejectUnauthorized },
  })

  const info = await transport.sendMail({
    from: config.user,
    to: input.to,
    cc: input.cc,
    bcc: input.bcc,
    replyTo: input.replyTo,
    inReplyTo: input.inReplyTo,
    references: input.references,
    subject: input.subject,
    text: input.text,
    html: input.html,
  })
  transport.close()

  return {
    messageID: info.messageId,
    accepted: info.accepted.map((address) => String(address)),
    rejected: info.rejected.map((address) => String(address)),
  }
}
