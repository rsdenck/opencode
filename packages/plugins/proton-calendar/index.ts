import { Plugin } from "@opencode/plugin"
import { calendarInfo, listEvents } from "./src/calendar.js"
import { calendarConfig } from "./src/config.js"

const text = (value: unknown) => ({ content: JSON.stringify(value, null, 2) })

const asQuery = (input: unknown) => {
  const value = input as { from?: string; to?: string; limit?: number; text?: string }
  return { from: value.from, to: value.to, limit: value.limit, text: value.text }
}

export default Plugin.define({
  id: "opencode.proton.calendar",
  async setup(ctx) {
    const config = () => calendarConfig(ctx.options)

    await ctx.tool.transform((editor) => {
      editor.namespace({
        name: "proton_calendar",
        description: "Read Proton Calendar events from a read-only ICS share link or an exported .ics file",
      })

      editor.add({
        name: "info",
        description:
          "Report which Proton calendar the plugin is reading, its timezone, how many raw events it contains, and when it was last fetched. Useful for checking that the share link works.",
        input: { type: "object", properties: {}, additionalProperties: false },
        execute: async (_input, context) => {
          context.signal.throwIfAborted()
          return text(await calendarInfo(config()))
        },
      })

      editor.add({
        name: "events",
        description:
          "List Proton Calendar events between two dates, with recurring events expanded into individual occurrences. Defaults to the next seven days. Read-only: Proton Calendar has no CalDAV or write API.",
        input: {
          type: "object",
          properties: {
            from: {
              type: "string",
              description: "Start of the range as an ISO 8601 date or timestamp. Defaults to now.",
            },
            to: {
              type: "string",
              description: "End of the range as an ISO 8601 date or timestamp. Defaults to seven days after from.",
            },
            limit: {
              type: "integer",
              minimum: 1,
              maximum: 500,
              description: "Maximum occurrences to return after sorting by start time.",
            },
            text: {
              type: "string",
              description: "Only return events whose summary, description, location, or organizer contains this text.",
            },
          },
          additionalProperties: false,
        },
        execute: async (input, context) => {
          context.signal.throwIfAborted()
          return text(await listEvents(config(), asQuery(input)))
        },
      })
    })
  },
})
