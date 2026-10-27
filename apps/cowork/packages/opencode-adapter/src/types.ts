import type { ApprovalMode, ModelRef } from "@cowork/core"

export interface OpenCodePermissionRule {
  action: string
  resource: string
  effect: "allow" | "deny" | "ask"
}

/**
 * Maps Cowork approval modes to OpenCode session permissions. Reads stay
 * allowed; mutating and network-capable tools require approval in `ask` mode
 * and are blocked in `strict` mode. The OpenCode process itself is not
 * sandboxed, so this is a policy layer, not an OS boundary.
 */
export function permissionsForMode(mode: ApprovalMode): OpenCodePermissionRule[] {
  if (mode === "auto") {
    return [{ action: "*", resource: "*", effect: "allow" }]
  }

  const rules: OpenCodePermissionRule[] = [
    { action: "*", resource: "*", effect: "allow" },
    { action: "read", resource: "*.env", effect: "ask" },
    { action: "read", resource: "*.env.*", effect: "ask" },
    { action: "read", resource: "*.env.example", effect: "allow" },
  ]

  const mutating = ["edit", "write", "shell", "bash"]
  const network = ["webfetch", "websearch", "fetch"]

  if (mode === "ask") {
    for (const action of [...mutating, ...network]) {
      rules.push({ action, resource: "*", effect: "ask" })
    }
    return rules
  }

  // strict
  for (const action of mutating) {
    rules.push({ action, resource: "*", effect: "ask" })
  }
  for (const action of network) {
    rules.push({ action, resource: "*", effect: "deny" })
  }
  rules.push({ action: "task", resource: "*", effect: "deny" })
  rules.push({ action: "browser", resource: "*", effect: "deny" })
  return rules
}

export interface AdapterEvent {
  type: string
  data: Record<string, unknown>
  raw: unknown
  receivedAt: number
}

export interface ModelSummary {
  providerID: string
  id: string
  name: string
  contextLimit: number
  outputLimit: number
  status: string
  variants: string[]
  capabilities: Record<string, unknown>
}

export interface ProviderSummary {
  id: string
  name: string
  models: ModelSummary[]
}

export interface AgentSummary {
  id: string
  name: string
  description: string | null
  mode: string
  hidden: boolean
}

export interface SkillSummary {
  id: string
  name: string
  description: string | null
  autoinvoke: boolean
}

export interface McpSummary {
  name: string
  status: string
  error?: string
}

export interface OpenCodeHealth {
  connected: boolean
  version: string | null
  pid: number | null
  url: string | null
  mode: "explicit" | "background-service" | "unknown"
  error: string | null
  checkedAt: number
}

export interface SessionSummary {
  id: string
  projectID: string
  outcome: string | null
  cost: number
  tokens: {
    input: number
    output: number
    reasoning: number
    cacheRead: number
    cacheWrite: number
  }
}

export interface AssistantMessageSummary {
  text: string
  reasoning: string
  finish: string | null
  toolCalls: Array<{ id: string; name: string; status: string | null; input: unknown }>
}

export interface AdapterConfig {
  url?: string
  token?: string
  service?: boolean
}

export interface CreateSessionInput {
  directory: string
  title: string
  model: ModelRef | null
  agent: string
  approvalMode: ApprovalMode
}

export interface PermissionRequestSummary {
  id: string
  sessionID: string
  action: string
  resources: string[]
  metadata: unknown
}
