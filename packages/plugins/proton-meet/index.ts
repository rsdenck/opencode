import { Plugin } from "@opencode/plugin"
import { meetInfo, parseRoom, upcomingMeetings } from "./src/meet.js"
import { meetConfig } from "./src/config.js"

const text = (value: unknown) => ({ content: JSON.stringify(value, null, 2) })

const asQuery = (input: unknown) => {
  const value = input as { from?: string; to?: string; limit?: number; text?: string }
  return { from: value.from, to: value.to, limit: value.limit, text: value.text }
}

export default Plugin.define({
  id: "opencode.proton.meet",
  async setup(ctx) {
    const config = () => meetConfig(ctx.options)

    await ctx.tool.transform((editor) => {
      editor.namespace({
        name: "proton_meet",
        description: "Find Proton Meet rooms scheduled in Proton Calendar events",
      })

      editor.add({
        name: "info",
        description:
          "Report which calendar the plugin reads, how many events it contains, and when it was fetched. Proton Meet has no API, so rooms are recovered from the calendar's ICS feed.",
        input: { type: "object", properties: {}, additionalProperties: false },
        execute: async (_input, context) => {
          context.signal.throwIfAborted()
          return text(await meetInfo(config()))
        },
      })

      editor.add({
        name: "upcoming",
        description:
          "List Proton Meet rooms for meetings between two dates, recurring meetings expanded. Defaults to the next seven days. Every result carries the join link; guest links can be opened without a Proton account.",
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
              maximum: 200,
              description: "Maximum meetings to return after sorting by start time.",
            },
            text: {
              type: "string",
              description: "Only return meetings whose summary contains this text.",
            },
          },
          additionalProperties: false,
        },
        execute: async (input, context) => {
          context.signal.throwIfAborted()
          return text(await upcomingMeetings(config(), asQuery(input)))
        },
      })

      editor.add({
        name: "next",
        description: "Return the next Proton Meet room from now on, or null when nothing is scheduled.",
        input: { type: "object", properties: {}, additionalProperties: false },
        execute: async (_input, context) => {
          context.signal.throwIfAborted()
          const [next] = await upcomingMeetings(config(), { limit: 1 })
          return text({ meeting: next ?? null })
        },
      })

      editor.add({
        name: "parse",
        description:
          "Normalize a pasted meet.proton.me link: guest or room shape, and the room code. Parsing is local; it does not contact Proton.",
        input: {
          type: "object",
          properties: {
            link: { type: "string", description: "A meet.proton.me URL copied from a calendar event or chat." },
          },
          required: ["link"],
          additionalProperties: false,
        },
        execute: async (input, _context) => {
          const value = input as { link: string }
          return text(parseRoom(value.link))
        },
      })
    })
  },
})
