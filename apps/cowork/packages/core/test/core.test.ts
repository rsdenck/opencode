import { describe, expect, it } from "vitest"
import {
  allowedTransitions,
  assertTransition,
  CoworkError,
  CreateTaskInputSchema,
  canTransition,
  DEFAULT_SETTINGS,
  isActive,
  isTaskStatus,
  isTerminal,
  ModelRefSchema,
  newId,
  redactSecrets,
  redactValue,
  toPublicError,
  UpdateSettingsInputSchema,
} from "../src/index.js"

describe("task state machine", () => {
  it("allows the documented happy path", () => {
    expect(canTransition("queued", "planning")).toBe(true)
    expect(canTransition("planning", "running")).toBe(true)
    expect(canTransition("running", "awaiting_approval")).toBe(true)
    expect(canTransition("awaiting_approval", "running")).toBe(true)
    expect(canTransition("running", "completed")).toBe(true)
  })

  it("rejects backwards transitions and terminal states", () => {
    expect(canTransition("completed", "running")).toBe(false)
    expect(canTransition("cancelled", "queued")).toBe(false)
    expect(canTransition("running", "queued")).toBe(false)
    expect(canTransition("queued", "queued")).toBe(false)
    expect(allowedTransitions("completed")).toEqual([])
  })

  it("throws a typed conflict for invalid transitions", () => {
    try {
      assertTransition("completed", "running")
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(CoworkError)
      expect((error as CoworkError).code).toBe("invalid_transition")
      expect((error as CoworkError).status).toBe(409)
    }
  })

  it("supports resuming interrupted and failed tasks", () => {
    expect(canTransition("interrupted", "queued")).toBe(true)
    expect(canTransition("failed", "queued")).toBe(true)
  })

  it("classifies statuses", () => {
    expect(isTerminal("completed")).toBe(true)
    expect(isTerminal("failed")).toBe(true)
    expect(isTerminal("cancelled")).toBe(true)
    expect(isTerminal("interrupted")).toBe(false)
    expect(isActive("awaiting_approval")).toBe(true)
    expect(isActive("interrupted")).toBe(false)
    expect(isTaskStatus("running")).toBe(true)
    expect(isTaskStatus("bogus")).toBe(false)
  })
})

describe("validation schemas", () => {
  it("trims prompts and defaults optional task fields", () => {
    const parsed = CreateTaskInputSchema.parse({
      workspaceID: "wsp_1",
      prompt: "  write a report  ",
    })
    expect(parsed.prompt).toBe("write a report")
    expect(parsed.approvalMode).toBeUndefined()
  })

  it("rejects empty or oversized task input", () => {
    expect(CreateTaskInputSchema.safeParse({ workspaceID: "wsp_1", prompt: " " }).success).toBe(
      false,
    )
    expect(
      CreateTaskInputSchema.safeParse({ workspaceID: "wsp_1", prompt: "x".repeat(20_001) }).success,
    ).toBe(false)
  })

  it("requires complete model references", () => {
    expect(ModelRefSchema.safeParse({ providerID: "opencode" }).success).toBe(false)
    expect(ModelRefSchema.parse({ providerID: "opencode", id: "big-pickle" })).toEqual({
      providerID: "opencode",
      id: "big-pickle",
    })
  })

  it("accepts partial settings updates but not invalid values", () => {
    expect(UpdateSettingsInputSchema.parse({ defaultAgent: "build" })).toEqual({
      defaultAgent: "build",
    })
    expect(UpdateSettingsInputSchema.safeParse({ taskRetentionDays: 0 }).success).toBe(false)
    expect(DEFAULT_SETTINGS.defaultApprovalMode).toBe("ask")
  })
})

describe("identifiers", () => {
  it("generates unique, prefixed, sortable identifiers", () => {
    const ids = Array.from({ length: 200 }, () => newId("tsk"))
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^tsk_[0-9A-HJKMNP-TV-Z]{26}$/)
    const timeParts = ids.map((id) => id.slice(4, 14))
    expect([...timeParts].sort()).toEqual(timeParts)
  })
})

describe("redaction", () => {
  it("redacts common credentials in strings", () => {
    const text =
      "key sk-abcdefghijklmnop token=supersecret Authorization: Bearer abc.def.ghi ghp_abcdefghijklmnopqrst"
    const redacted = redactSecrets(text)
    expect(redacted).not.toContain("sk-abcdefghijklmnop")
    expect(redacted).not.toContain("supersecret")
    expect(redacted).not.toContain("abc.def.ghi")
    expect(redacted).not.toContain("ghp_abcdefghijklmnopqrst")
  })

  it("redacts sensitive object keys recursively", () => {
    const value = redactValue({
      ok: "visible",
      token: "hide-me",
      nested: { password: "also-hide", list: [{ authorization: "Bearer x" }] },
    })
    expect(value.ok).toBe("visible")
    expect(value.token).toBe("***REDACTED***")
    expect(value.nested.password).toBe("***REDACTED***")
    expect(value.nested.list[0]?.authorization).toBe("***REDACTED***")
  })

  it("does not expose arbitrary internal error messages", () => {
    expect(toPublicError(new Error("SQLITE_ERROR at /root/secret.db"))).toEqual({
      code: "internal_error",
      message: "Unexpected internal error",
    })
    expect(toPublicError(new CoworkError("bad", "Public message", { status: 400 }))).toEqual({
      code: "bad",
      message: "Public message",
    })
  })
})
