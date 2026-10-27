import { join } from "node:path"
import { buildApp } from "./app.js"
import { COWORK_VERSION, loadConfig } from "./config.js"

async function main(): Promise<void> {
  const config = loadConfig()
  const context = await buildApp({ config })

  try {
    await context.app.listen({ host: config.host, port: config.port })
  } catch (error) {
    context.app.log.error({ err: error }, `Failed to start Cowork on ${config.host}:${config.port}`)
    await context.app.close()
    process.exitCode = 1
    return
  }

  const tokenFile = join(config.dataDir, "auth-token")
  context.app.log.info(
    {
      version: COWORK_VERSION,
      url: `http://${config.host}:${config.port}`,
      dataDir: config.dataDir,
      tokenFile,
      opencode: config.opencodeUrl ?? "background-service",
    },
    "OpenCode Cowork started",
  )
  context.app.log.info(
    `Open http://${config.host}:${config.port} in a browser. The API token is injected into the web UI and stored at ${tokenFile}`,
  )

  const shutdown = async (signal: string) => {
    context.app.log.info({ signal }, "Shutting down Cowork")
    try {
      await context.app.close()
    } finally {
      process.exit(0)
    }
  }

  process.on("SIGINT", () => void shutdown("SIGINT"))
  process.on("SIGTERM", () => void shutdown("SIGTERM"))
}

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection", reason)
})

main().catch((error) => {
  console.error("Fatal startup error", error)
  process.exit(1)
})
