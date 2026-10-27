import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join, resolve } from "node:path"
import { defineConfig, type Plugin } from "vite"
import solid from "vite-plugin-solid"

function resolveDevToken(): string {
  if (process.env.COWORK_AUTH_TOKEN) return process.env.COWORK_AUTH_TOKEN.trim()
  const candidates = [
    process.env.COWORK_DATA_DIR ? join(process.env.COWORK_DATA_DIR, "auth-token") : null,
    join(homedir(), ".local", "share", "cowork", "auth-token"),
  ].filter((entry): entry is string => Boolean(entry))
  for (const file of candidates) {
    try {
      return readFileSync(file, "utf8").trim()
    } catch {
      // Try the next location.
    }
  }
  return ""
}

function injectToken(): Plugin {
  const token = resolveDevToken()
  return {
    name: "cowork-inject-token",
    transformIndexHtml(html) {
      if (!token) return html
      return html.replace("</head>", `  <meta name="cowork-token" content="${token}" />\n  </head>`)
    },
  }
}

const serverPort = Number(process.env.COWORK_PORT ?? 4319)

export default defineConfig({
  plugins: [solid(), injectToken()],
  root: resolve(import.meta.dirname),
  resolve: {
    conditions: ["development", "browser"],
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${serverPort}`,
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    target: "es2022",
  },
})
