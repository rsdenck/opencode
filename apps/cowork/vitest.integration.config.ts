import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["**/*.integration.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    environment: "node",
    testTimeout: 240_000,
    hookTimeout: 240_000,
    fileParallelism: false,
  },
})
