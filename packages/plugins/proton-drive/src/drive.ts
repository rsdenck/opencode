import { parseJson } from "./config.js"
import type { DriveConfig } from "./config.js"

export interface DriveResult {
  stdout: string
  stderr: string
}

async function resolveBinary(config: DriveConfig) {
  const binary = config.binary.includes("/")
    ? (await Bun.file(config.binary).exists())
      ? config.binary
      : null
    : Bun.which(config.binary)

  if (!binary) {
    throw new Error(
      `Proton Drive CLI not found (${config.binary}). Download it from https://proton.me/drive/download, run "proton-drive auth login" once, then set the binary option or PROTON_DRIVE_BIN.`,
    )
  }
  return binary
}

async function runDrive(config: DriveConfig, args: string[], signal?: AbortSignal): Promise<DriveResult> {
  const binary = await resolveBinary(config)
  const timeout = AbortSignal.timeout(config.timeoutMs)
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout

  // stdin is closed because every prompting command gets an explicit flag: an
  // unanswered prompt would block until the timeout.
  const proc = Bun.spawn([binary, ...args], { stdin: "ignore", stdout: "pipe", stderr: "pipe" })
  const kill = () => proc.kill()
  combined.addEventListener("abort", kill, { once: true })

  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  combined.removeEventListener("abort", kill)

  if (combined.aborted) {
    throw new Error(`proton-drive ${args[0]} timed out after ${config.timeoutMs} ms.`)
  }
  if (code !== 0) {
    throw new Error(`proton-drive ${args.join(" ")} failed with exit code ${code}: ${stderr.trim() || stdout.trim()}`)
  }
  return { stdout, stderr }
}

const output = (result: DriveResult) => {
  const parsed = parseJson(result.stdout)
  return parsed === undefined ? { output: result.stdout.trim() || result.stderr.trim() } : parsed
}

const conflictFlags = (config: DriveConfig) => [
  "--file-conflict-strategy",
  config.fileConflictStrategy,
  "--folder-conflict-strategy",
  config.folderConflictStrategy,
]

export async function version(config: DriveConfig, signal?: AbortSignal) {
  return output(await runDrive(config, ["version"], signal))
}

export async function list(config: DriveConfig, path: string, signal?: AbortSignal) {
  return output(await runDrive(config, ["filesystem", "list", path, "--json"], signal))
}

export async function upload(config: DriveConfig, local: string, remote: string, signal?: AbortSignal) {
  return output(
    await runDrive(
      config,
      [
        "filesystem",
        "upload",
        local,
        remote,
        ...conflictFlags(config),
        ...(config.skipThumbnails ? ["--skip-thumbnails"] : []),
        "--json",
      ],
      signal,
    ),
  )
}

export async function download(config: DriveConfig, remote: string, local: string, signal?: AbortSignal) {
  return output(
    await runDrive(config, ["filesystem", "download", remote, local, ...conflictFlags(config), "--json"], signal),
  )
}

export async function invite(config: DriveConfig, path: string, email: string, role: string, signal?: AbortSignal) {
  return output(
    await runDrive(config, ["sharing", "invite", path, "--user", email, "--role", role, "--json"], signal),
  )
}

export async function shareStatus(config: DriveConfig, path: string, signal?: AbortSignal) {
  return output(await runDrive(config, ["sharing", "status", path, "--json"], signal))
}
