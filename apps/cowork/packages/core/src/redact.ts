const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/\b(sk-[A-Za-z0-9_-]{12,})\b/g, "sk-***REDACTED***"],
  [/\b(ghp_[A-Za-z0-9]{20,})\b/g, "ghp_***REDACTED***"],
  [/\b(github_pat_[A-Za-z0-9_]{20,})\b/g, "github_pat_***REDACTED***"],
  [/\b(xox[baprs]-[A-Za-z0-9-]{10,})\b/g, "xox-***REDACTED***"],
  [/(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi, "$1***REDACTED***"],
  [/(Basic\s+)[A-Za-z0-9+/=]{8,}/gi, "$1***REDACTED***"],
  [
    /((?:api[_-]?key|token|secret|password|authorization)["'\s:=]+)[^\s"',}]{6,}/gi,
    "$1***REDACTED***",
  ],
]

/** Redacts common credential formats from arbitrary text before logging or persistence. */
export function redactSecrets(input: string): string {
  let output = input
  for (const [pattern, replacement] of SECRET_PATTERNS) {
    output = output.replace(pattern, replacement)
  }
  return output
}

/** Recursively redacts sensitive keys and credential-looking string values. */
export function redactValue<T>(value: T, depth = 0): T {
  if (depth > 8) return "[truncated]" as T
  if (typeof value === "string") return redactSecrets(value) as T
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, depth + 1)) as T
  }
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (/^(authorization|api[_-]?key|token|secret|password|cookie)$/i.test(key)) {
        result[key] = "***REDACTED***"
      } else {
        result[key] = redactValue(entry, depth + 1)
      }
    }
    return result as T
  }
  return value
}
