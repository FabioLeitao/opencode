import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { Event } from "../src/event.js"
import { EventLog } from "../src/event-log.js"
import { SessionEvent } from "../src/session-event.js"

describe("public event schemas", () => {
  test("definition is pure", () => {
    const definitions = Event.inventory()
    Event.ephemeral({ type: "test.pure", schema: { value: Schema.String } })
    expect(definitions).toEqual([])
  })

  test("latest selection is independent of declaration order", () => {
    const historical = Event.durable({
      type: "test.versioned",
      durable: { aggregate: "id", version: 1 },
      schema: { id: Schema.String },
    })
    const current = Event.durable({
      type: "test.versioned",
      durable: { aggregate: "id", version: 2 },
      schema: { id: Schema.String, value: Schema.String },
    })

    expect(Event.latest([historical, current]).get(current.type)).toBe(current)
    expect(Event.latest([current, historical]).get(current.type)).toBe(current)
  })

  test("durable definitions are indexed by type and version", () => {
    const definition = Event.durable({
      type: "test.durable",
      durable: { aggregate: "id", version: 1 },
      schema: { id: Schema.String },
    })

    expect(Event.durableMap([definition]).get("test.durable.1")).toBe(definition)
  })

  test("synced marker encodes the captured watermark", () => {
    expect(
      Schema.encodeSync(EventLog.Synced)({
        type: "log.synced",
        aggregateID: "ses_test",
        seq: Event.Seq.make(1),
      }),
    ).toEqual({ type: "log.synced", aggregateID: "ses_test", seq: 1 })
    expect(Schema.encodeSync(EventLog.Synced)({ type: "log.synced", aggregateID: "ses_test" })).toEqual({
      type: "log.synced",
      aggregateID: "ses_test",
    })
  })
})

describe("session.step.ended resolvedModel (DM1.6-2)", () => {
  const base = {
    sessionID: "ses_test",
    assistantMessageID: "msg_test",
    finish: "stop",
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  }
  const decode = Schema.decodeUnknownSync(SessionEvent.Step.Ended.data)

  test("keeps resolvedModel when present", () => {
    expect(decode({ ...base, resolvedModel: "vendor/real-x" }).resolvedModel).toBe("vendor/real-x")
  })

  test("decodes without resolvedModel", () => {
    expect(decode(base)).not.toHaveProperty("resolvedModel")
  })

  test("drops an unknown key", () => {
    expect(decode({ ...base, unknownKey: "x" })).not.toHaveProperty("unknownKey")
  })
})
