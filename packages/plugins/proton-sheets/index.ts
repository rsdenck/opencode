import { Plugin } from "@opencode/plugin"
import { documentInfo, listDocuments } from "./src/catalog.js"
import { SHEET_MEDIA_TYPE, catalogConfig } from "./src/config.js"

const text = (value: unknown) => ({ content: JSON.stringify(value, null, 2) })

const asQuery = (input: unknown) => {
  const value = input as { path?: string; depth?: number; limit?: number; text?: string }
  return { path: value.path, depth: value.depth, limit: value.limit, text: value.text }
}

export default Plugin.define({
  id: "opencode.proton.sheets",
  async setup(ctx) {
    const config = () => catalogConfig(ctx.options, SHEET_MEDIA_TYPE, "sheet")

    await ctx.tool.transform((editor) => {
      editor.namespace({
        name: "proton_sheets",
        description: "Find Proton Sheets spreadsheets in Proton Drive and explain how to export them",
      })

      editor.add({
        name: "list",
        description:
          "List Proton Sheets spreadsheets stored in Proton Drive. Walks folders from the given path and returns only spreadsheets, not regular files or folders. Depth 1 inspects just that folder. Read-only: Proton Sheets has no public API, and the Proton Drive CLI refuses to download spreadsheet content.",
        input: {
          type: "object",
          properties: {
            path: { type: "string", description: "Remote folder to start from, defaults to /my-files." },
            depth: {
              type: "integer",
              minimum: 1,
              maximum: 5,
              description: "How many folder levels to walk. Defaults to 1.",
            },
            limit: {
              type: "integer",
              minimum: 1,
              maximum: 500,
              description: "Maximum spreadsheets to return. Defaults to 100.",
            },
            text: {
              type: "string",
              description: "Only return spreadsheets whose name or path contains this text.",
            },
          },
          additionalProperties: false,
        },
        execute: async (input, context) => text(await listDocuments(config(), asQuery(input), context.signal)),
      })

      editor.add({
        name: "info",
        description:
          "Describe one Proton Sheets spreadsheet by its remote path: uid, timestamps, size, sharing state, and the formats Proton offers when you export it from the web app. Spreadsheet content is not readable from here.",
        input: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Remote path of the spreadsheet, for example /my-files/Finance/Budget.",
            },
          },
          required: ["path"],
          additionalProperties: false,
        },
        execute: async (input, context) => {
          const value = input as { path: string }
          return text(await documentInfo(config(), value.path, context.signal))
        },
      })
    })
  },
})
