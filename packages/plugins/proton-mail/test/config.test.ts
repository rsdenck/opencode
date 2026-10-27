import { expect, test } from "bun:test"
import { bridgeConfig } from "../src/config.js"

test("uses Bridge defaults and options credentials", () => {
  expect(bridgeConfig({ user: "me@proton.me", password: "secret" })).toEqual({
    host: "127.0.0.1",
    imapPort: 1143,
    smtpPort: 1025,
    user: "me@proton.me",
    password: "secret",
    rejectUnauthorized: false,
  })
})

test("port overrides accept numbers and numeric strings", () => {
  const config = bridgeConfig({ user: "me@proton.me", password: "secret", imapPort: 9143, smtpPort: "9025" })
  expect(config.imapPort).toBe(9143)
  expect(config.smtpPort).toBe(9025)
})

test("invalid ports fall back to the Bridge defaults", () => {
  const config = bridgeConfig({ user: "me@proton.me", password: "secret", imapPort: 0, smtpPort: "nope" })
  expect(config.imapPort).toBe(1143)
  expect(config.smtpPort).toBe(1025)
})

test("tls verification is opt-in", () => {
  expect(bridgeConfig({ user: "me@proton.me", password: "secret", rejectUnauthorized: true }).rejectUnauthorized).toBe(
    true,
  )
})

test("missing credentials explain how to get them", () => {
  expect(() => bridgeConfig({})).toThrow(/Bridge credentials are missing/)
})
