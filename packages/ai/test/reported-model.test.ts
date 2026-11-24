import { describe, expect, test } from "bun:test"
import { ProviderShared } from "../src/protocols/shared.js"

describe("ProviderShared.reportedModel (DM1.6-4 to DM1.6-9)", () => {
  // DM1.6-4
  test("DM1.6-4: ANSI escape and RTL override are removed, text stays", () => {
    expect(ProviderShared.reportedModel("\u001b[31mvendor/x\u202e\u200b")).toBe("[31mvendor/x")
  })

  // DM1.6-5: one test per removed class, placed between letters so the letters stay
  test("DM1.6-5: Cc (control) - \\u0007 removed", () => {
    expect(ProviderShared.reportedModel("ven\u0007dor/x")).toBe("vendor/x")
  })

  test("DM1.6-5: Cf (format) - ⁦ removed", () => {
    expect(ProviderShared.reportedModel("ven\u2066dor/x")).toBe("vendor/x")
  })

  test("DM1.6-5: Cs (surrogate) - lone \\ud800 removed", () => {
    expect(ProviderShared.reportedModel("ven\ud800dor/x")).toBe("vendor/x")
  })

  test("DM1.6-5: Co (private use) -  removed", () => {
    expect(ProviderShared.reportedModel("ven\ue000dor/x")).toBe("vendor/x")
  })

  test("DM1.6-5: Zl (line separator) -   removed", () => {
    expect(ProviderShared.reportedModel("ven\u2028dor/x")).toBe("vendor/x")
  })

  test("DM1.6-5: Zp (paragraph separator) -   removed", () => {
    expect(ProviderShared.reportedModel("ven\u2029dor/x")).toBe("vendor/x")
  })

  test("DM1.6-5: non-ASCII space - \\u00A0 removed", () => {
    expect(ProviderShared.reportedModel("ven\u00A0dor/x")).toBe("vendor/x")
  })

  // DM1.6-6: combining accent, emoji, Japanese stay whole
  test("DM1.6-6: combining accent stays", () => {
    expect(ProviderShared.reportedModel("e\u0301")).toBe("e\u0301")
  })

  test("DM1.6-6: emoji stays", () => {
    expect(ProviderShared.reportedModel("\u{1F600}")).toBe("\u{1F600}")
  })

  test("DM1.6-6: Japanese stays", () => {
    expect(ProviderShared.reportedModel("\u65e5\u672c")).toBe("\u65e5\u672c")
  })

  // DM1.6-7: trim spaces
  test("DM1.6-7: leading/trailing spaces trimmed", () => {
    expect(ProviderShared.reportedModel("  vendor/x  ")).toBe("vendor/x")
  })

  test("DM1.6-7: internal spaces preserved", () => {
    expect(ProviderShared.reportedModel("vendor x")).toBe("vendor x")
  })

  // DM1.6-8: 256-byte limit at character boundaries
  test("DM1.6-8: 300-byte value built from é (2 bytes) and 😀 (4 bytes), byte 256 falls inside char", () => {
    // Build a string that's over 256 bytes, with the 256th byte inside a character
    // Each é = 2 bytes, each 😀 = 4 bytes
    // 128 * "é" = 256 bytes exactly
    // 127 * "é" + "😀" = 254 + 4 = 258 bytes (byte 256 is inside the emoji)
    const exactly256 = "é".repeat(128)
    const over256 = "é".repeat(127) + "\u{1F600}"

    const sanitizedExactly = ProviderShared.reportedModel(exactly256)
    const sanitizedOver = ProviderShared.reportedModel(over256)

    // Exactly 256 bytes stays whole
    expect(new TextEncoder().encode(sanitizedExactly).length).toBeLessThanOrEqual(256)
    expect(sanitizedExactly).toBe(exactly256)

    // Over 256 bytes: byte length <= 256, no replacement char, prefix of sanitized
    expect(new TextEncoder().encode(sanitizedOver).length).toBeLessThanOrEqual(256)
    expect(sanitizedOver).not.toContain("\uFFFD")
    // The sanitized value should be a prefix of what it would be without the limit
    const fullSanitized = ProviderShared.reportedModel("é".repeat(127) + "\u{1F600}" + "more")
    expect(fullSanitized.startsWith(sanitizedOver)).toBe(true)
  })

  // DM1.6-9: edge cases return undefined
  test("DM1.6-9: empty string -> undefined", () => {
    expect(ProviderShared.reportedModel("")).toBeUndefined()
  })

  test("DM1.6-9: only control chars -> undefined", () => {
    expect(ProviderShared.reportedModel("\u001b\u0007")).toBeUndefined()
  })

  test("DM1.6-9: only spaces -> undefined", () => {
    expect(ProviderShared.reportedModel("   ")).toBeUndefined()
  })

  test("DM1.6-9: number -> undefined", () => {
    expect(ProviderShared.reportedModel(42)).toBeUndefined()
  })

  test("DM1.6-9: null -> undefined", () => {
    expect(ProviderShared.reportedModel(null)).toBeUndefined()
  })

  test("DM1.6-9: object -> undefined", () => {
    expect(ProviderShared.reportedModel({})).toBeUndefined()
  })
})