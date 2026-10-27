import { defineConfig } from "tsup"

/**
 * Server bundle configuration.
 *
 * `removeNodeProtocol` is disabled deliberately: the server imports Node's
 * built-in `node:sqlite` module (available from Node 22.5). tsup's default
 * plugin strips the `node:` prefix, which esbuild then resolves as the
 * non-existent `sqlite` package. Keeping the prefix preserves the built-in.
 */
export default defineConfig({
  entry: ["apps/server/src/index.ts"],
  format: ["esm"],
  platform: "node",
  target: "node22",
  outDir: "apps/server/dist",
  clean: true,
  sourcemap: true,
  removeNodeProtocol: false,
  // Keep third-party packages external: several (e.g. @fastify/static) are
  // CommonJS and use dynamic require, which cannot be bundled into ESM.
  // Workspace packages are bundled because their exports point at TypeScript
  // sources rather than compiled JavaScript.
  skipNodeModulesBundle: true,
  noExternal: [/^@cowork\//],
})
