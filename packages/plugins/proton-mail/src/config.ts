import type { PluginOptions } from "@opencode/plugin"

export interface BridgeConfig {
  readonly host: string
  readonly imapPort: number
  readonly smtpPort: number
  readonly user: string
  readonly password: string
  /**
   * Bridge terminates TLS with its own local certificate, so verification is
   * off by default. Set it to true when Bridge uses a certificate your system
   * already trusts.
   */
  readonly rejectUnauthorized: boolean
}

const defaults = {
  host: "127.0.0.1",
  imapPort: 1143,
  smtpPort: 1025,
} as const

const readString = (value: unknown) => (typeof value === "string" && value.length > 0 ? value : undefined)

const readPort = (value: unknown) => {
  const port = typeof value === "number" ? value : Number(value)
  return Number.isInteger(port) && port > 0 && port < 65_536 ? port : undefined
}

/**
 * Bridge listens on loopback only. Credentials come from the Bridge app's
 * "Email client configuration" panel, not from the Proton account password.
 */
export function bridgeConfig(options: PluginOptions): BridgeConfig {
  const user = readString(options.user) ?? readString(process.env.PROTON_BRIDGE_USER)
  const password = readString(options.password) ?? readString(process.env.PROTON_BRIDGE_PASSWORD)

  if (!user || !password) {
    throw new Error(
      "Proton Mail Bridge credentials are missing. Open the Bridge app, copy the IMAP/SMTP username and password from Account settings, then set plugin options user and password or the PROTON_BRIDGE_USER and PROTON_BRIDGE_PASSWORD environment variables.",
    )
  }

  return {
    host: readString(options.host) ?? readString(process.env.PROTON_BRIDGE_HOST) ?? defaults.host,
    imapPort: readPort(options.imapPort) ?? readPort(process.env.PROTON_BRIDGE_IMAP_PORT) ?? defaults.imapPort,
    smtpPort: readPort(options.smtpPort) ?? readPort(process.env.PROTON_BRIDGE_SMTP_PORT) ?? defaults.smtpPort,
    user,
    password,
    rejectUnauthorized:
      options.rejectUnauthorized === true || process.env.PROTON_BRIDGE_REJECT_UNAUTHORIZED === "true",
  }
}
