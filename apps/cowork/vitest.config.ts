import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "apps/server/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/*.integration.test.ts"],
    environment: "node",
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
})
