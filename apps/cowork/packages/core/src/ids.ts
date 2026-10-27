import { randomBytes } from "node:crypto"

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

/**
 * Generates a lexicographically sortable, URL-safe identifier with a prefix.
 * The format is `<prefix>_<26 chars>` (ULID-compatible alphabet and length).
 */
export function newId(prefix: string): string {
  const time = Date.now()
  let timePart = ""
  let remaining = time
  for (let i = 0; i < 10; i++) {
    timePart = ALPHABET[remaining % 32] + timePart
    remaining = Math.floor(remaining / 32)
  }

  const random = randomBytes(16)
  let randomPart = ""
  for (let i = 0; i < 16; i++) {
    randomPart += ALPHABET[(random[i] ?? 0) % 32]
  }

  return `${prefix}_${timePart}${randomPart}`
}

export const ID_PREFIXES = {
  workspace: "wsp",
  task: "tsk",
  step: "stp",
  approval: "apv",
  event: "evt",
} as const
