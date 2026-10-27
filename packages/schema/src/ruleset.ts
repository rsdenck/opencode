import { Rule, Ruleset, Effect } from "./permission.js"

/** Generate a Permission.Ruleset from a mode string. */
export function permissionsForMode(mode: "ask" | "auto" | "strict"): Ruleset {
  if (mode === "auto") {
    return [{ action: "*", resource: "*", effect: "allow" } as Rule]
  }

  const base: Rule = { action: "*", resource: "*", effect: "allow" }
  const mutating = ["edit", "write", "shell", "bash"] as const
  const network = ["webfetch", "websearch", "fetch"] as const

  if (mode === "ask") {
    return [
      base,
      ...mutating.map((a) => ({ action: a, resource: "*", effect: "ask" } as Rule)),
      ...network.map((a) => ({ action: a, resource: "*", effect: "ask" } as Rule)),
    ]
  }

  // strict
  return [
    base,
    ...mutating.map((a) => ({ action: a, resource: "*", effect: "ask" } as Rule)),
    ...network.map((a) => ({ action: a, resource: "*", effect: "deny" } as Rule)),
    { action: "task", resource: "*", effect: "deny" } as Rule,
    { action: "browser", resource: "*", effect: "deny" } as Rule,
  ]
}
