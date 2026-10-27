import { randomBytes } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join, resolve } from "node:path"
import { CoworkError } from "@cowork/core"

export const COWORK_VERSION = "0.1.0"

export interface ServerConfig {
  host: string
  port: number
  dataDir: string
  databaseFile: string
  webDir: string
  authToken: string
  allowedOrigins: string[]
  allowedWorkspaceRoots: string[]
  maxPromptChars: number
  maxFiles: number
  bodyLimit: number
  opencodeUrl?: string
  opencodeToken?: string
  opencodeService: boolean
  production: boolean
}

function defaultDataDir(): string {
  if (process.env.XDG_DATA_HOME) return join(process.env.XDG_DATA_HOME, "cowork")
  return join(homedir(), ".local", "share", "cowork")
}

function defaultWebDir(): string {
  // Both src/index.ts (tsx) and dist/index.js live two levels below apps/.
  return resolve(import.meta.dirname, "../../web/dist")
}

function readOrCreateToken(dataDir: string, explicit?: string): string {
  if (explicit && explicit.trim().length > 0) return explicit.trim()
  const tokenFile = join(dataDir, "auth-token")
  if (existsSync(tokenFile)) {
    const value = readFileSync(tokenFile, "utf8").trim()
    if (value.length >= 16) return value
  }
  const token = randomBytes(32).toString("base64url")
  writeFileSync(tokenFile, `${token}\n`, { encoding: "utf8", mode: 0o600 })
  return token
}

function intFromEnv(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) return fallback
  return Math.min(Math.max(parsed, min), max)
}

function listFromEnv(value: string | undefined): string[] {
  if (!value) return []
  return value
    .split(/[,;]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => resolve(entry))
}

function originsFromEnv(value: string | undefined): string[] {
  if (!value) return []
  return value
    .split(/[,;\s]+/)
    .map((entry) => entry.trim().replace(/\/$/, ""))
    .filter((entry) => entry.length > 0)
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const dataDir = resolve(env.COWORK_DATA_DIR ?? defaultDataDir())
  mkdirSync(dataDir, { recursive: true, mode: 0o700 })

  const host = env.COWORK_HOST ?? "127.0.0.1"
  const port = intFromEnv(env.COWORK_PORT, 4319, 1, 65535)
  const production = env.NODE_ENV === "production"
  const configuredOrigins = originsFromEnv(env.COWORK_ALLOWED_ORIGINS)

  const origins = new Set<string>([
    `http://${host}:${port}`,
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
    ...configuredOrigins,
  ])
  if (!production) {
    origins.add("http://127.0.0.1:5173")
    origins.add("http://localhost:5173")
  }

  return {
    host,
    port,
    dataDir,
    databaseFile: join(dataDir, "cowork.db"),
    webDir: resolve(env.COWORK_WEB_DIR ?? defaultWebDir()),
    authToken: readOrCreateToken(dataDir, env.COWORK_AUTH_TOKEN),
    allowedOrigins: [...origins],
    allowedWorkspaceRoots: listFromEnv(env.COWORK_ALLOWED_WORKSPACE_ROOTS),
    maxPromptChars: intFromEnv(env.COWORK_MAX_PROMPT_CHARS, 20_000, 1, 100_000),
    maxFiles: intFromEnv(env.COWORK_MAX_FILES, 5000, 100, 100_000),
    bodyLimit: intFromEnv(env.COWORK_MAX_RESPONSE_BYTES, 1_048_576, 16_384, 16_777_216),
    opencodeUrl: env.COWORK_OPENCODE_URL,
    opencodeToken: env.COWORK_OPENCODE_TOKEN,
    opencodeService: env.COWORK_OPENCODE_SERVICE !== "0",
    production,
  }
}

export function assertSecureBinding(config: ServerConfig): void {
  const loopback = ["127.0.0.1", "::1", "localhost"].includes(config.host)
  if (!loopback && !config.production) {
    throw new CoworkError(
      "unsafe_binding",
      "Refusing to bind to a non-loopback address unless NODE_ENV=production and an auth token is configured",
      { status: 500 },
    )
  }
  if (!loopback && config.authToken.length < 24) {
    throw new CoworkError(
      "weak_token",
      "A strong COWORK_AUTH_TOKEN is required for non-loopback binding",
      {
        status: 500,
      },
    )
  }
}
