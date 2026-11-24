import { describe, expect, test } from "bun:test"
import { createTestRenderer } from "@opentui/core/testing"
import { Effect, FileSystem } from "effect"
import { Global } from "@opencode/util/global"
import type { OpenCodeEvent, SessionMessageInfo } from "@opencode/client"
import { createEventStream, createFetch, directory, json } from "./fixture/tui-client"
import { tmpdir } from "./fixture/fixture"

// Acceptance tests (QA, black box) for the screen part of the epic "resolved model" (design M1.6): AM1.6-3t, AM1.6-4t,
// AM1.6-10 and AM1.6-11. The messages come from fixtures, so the screen does not depend on the capture.
// Tests marked `pending` are the acceptance of task M1.3 (#8) and use `test.failing`: the run breaks when one of them
// starts to pass, so whoever implements the task has to remove the mark. AM1.6-12t (flag, end to end) is left to
// AM1.6-12 of packages/server: see the PR description.

const pending = test.failing

const session = {
  id: "ses_resolved_model",
  title: "Resolved model",
  projectID: "proj_test",
  location: { directory },
  cost: 0,
  tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  time: { created: 0, updated: 0 },
}
// No catalog is served, so the footer names the model as `providerID/id`: the label the issue calls `freellmapi/auto`.
const model = { providerID: "freellmapi", id: "auto" }
const LABEL = "freellmapi/auto"
const ESC = "\u001b"

// Two finished turns with different agents, so each footer line can be told apart. The first turn may carry the field.
const turns = (first: Record<string, unknown> = {}) =>
  [
    { type: "user", id: "user-1", text: "First question", time: { created: 0 } },
    {
      type: "assistant",
      id: "assistant-1",
      agent: "build",
      model,
      finish: "stop",
      content: [{ type: "text", text: "First answer" }],
      time: { created: 1, completed: 2 },
      ...first,
    },
    { type: "user", id: "user-2", text: "Second question", time: { created: 3 } },
    {
      type: "assistant",
      id: "assistant-2",
      agent: "plan",
      model,
      finish: "stop",
      content: [{ type: "text", text: "Second answer" }],
      time: { created: 4, completed: 5 },
    },
  ] as SessionMessageInfo[]

async function mount(input: { readonly width: number; readonly messages: SessionMessageInfo[] }) {
  const state = await tmpdir()
  const setup = await createTestRenderer({ width: input.width, height: 40, kittyKeyboard: true })
  await setup.renderer.setupTerminal()
  setup.renderer.start()
  const events = createEventStream()
  const calls = createFetch((url) => {
    if (url.pathname === "/api/session") return json({ data: [session], cursor: {} })
    if (url.pathname === `/api/session/${session.id}`) return json({ data: session })
    if (url.pathname === `/api/session/${session.id}/message`)
      return json({ data: input.messages.toReversed(), cursor: {} })
    if (url.pathname === `/api/session/${session.id}/inbox` || url.pathname === `/api/session/${session.id}/permission`)
      return json({ data: [] })
  }, events)
  const server = Bun.serve({ port: 0, idleTimeout: 0, fetch: (request) => calls.fetch(request) })
  const { run } = await import("../src/app")
  const task = Effect.runPromise(
    run({
      app: { name: "test", version: "test", channel: "test" },
      server: { endpoint: { url: server.url.toString() } },
      config: {
        get: async () => ({ animations: false, tabs: { enabled: false }, session: { verbosity: "high" } }),
        update: async () => ({}),
      },
      packages: { prepare: async () => ({ directory: "" }) },
      args: { sessionID: session.id },
      terminalHandoff: async () => ({ renderer: setup.renderer, mode: "dark", complete: () => {} }),
      log: () => {},
    }).pipe(Effect.provide(Global.layerWith({ state: state.path })), Effect.provide(FileSystem.layerNoop({}))),
  )
  return {
    setup,
    events,
    /** The footer line of the turn whose agent is `agent` ("Build" or "Plan"), or "" when it is not on screen. */
    footer: (agent: "Build" | "Plan") =>
      setup
        .captureCharFrame()
        .split("\n")
        .find((line) => line.trimStart().startsWith(`${agent} ·`))
        ?.trim() ?? "",
    async [Symbol.asyncDispose]() {
      setup.renderer.destroy()
      await task
      await server.stop()
      await state[Symbol.asyncDispose]()
    },
  }
}

describe("footer of the assistant message, preparation (not pending)", () => {
  test("a finished turn shows its agent and the requested model at 100 columns, with no arrow", async () => {
    await using screen = await mount({ width: 100, messages: turns() })
    await screen.setup.waitForFrame((frame) => frame.includes("Second answer"))
    await screen.setup.waitForVisualIdle({ quietFrames: 3 })
    expect(screen.footer("Build")).toContain(`Build · ${LABEL}`)
    expect(screen.footer("Plan")).toContain(`Plan · ${LABEL}`)
    expect(screen.setup.captureCharFrame()).not.toContain("→")
  }, 60_000)
})

describe("footer of the assistant message (pending until M1.3)", () => {
  // AM1.6-10 (T1.10, wide) and AM1.6-4t (T1.4): the turn that has the field shows it, the one that does not shows no arrow.
  pending(
    "AM1.6-10 and AM1.6-4t: at 100 columns the footer shows the arrow only for the turn that has the field",
    async () => {
      await using screen = await mount({ width: 100, messages: turns({ resolvedModel: "vendor/real-x" }) })
      await screen.setup.waitForFrame((frame) => frame.includes("Second answer"))
      await screen.setup.waitForVisualIdle({ quietFrames: 3 })
      expect(screen.footer("Build")).toContain(`Build · ${LABEL} → vendor/real-x`)
      expect(screen.footer("Plan")).toContain(`Plan · ${LABEL}`)
      expect(screen.footer("Plan")).not.toContain("→")
      expect(screen.setup.captureCharFrame().match(/→/g)).toHaveLength(1)
    },
    60_000,
  )

  // AM1.6-3t (T1.3): the value the server stores for a dirty id has no ESC left, and the screen prints it as text.
  pending(
    "AM1.6-3t: a stored value that still has [31m shows it as text and no ESC reaches the frame",
    async () => {
      await using screen = await mount({ width: 100, messages: turns({ resolvedModel: "[31mvendor/x" }) })
      await screen.setup.waitForFrame((frame) => frame.includes("Second answer"))
      await screen.setup.waitForVisualIdle({ quietFrames: 3 })
      expect(screen.footer("Build")).toContain("→ [31mvendor/x")
      expect(screen.setup.captureCharFrame()).not.toContain(ESC)
    },
    60_000,
  )

  // AM1.6-11 (T1.10, narrow). The wide frame is the control: the arrow is there, then the same screen shrinks to 24 columns.
  pending(
    "AM1.6-11: at 24 columns the footer shows neither the model nor the arrow, as today",
    async () => {
      await using screen = await mount({ width: 100, messages: turns({ resolvedModel: "vendor/real-x" }) })
      await screen.setup.waitForFrame((frame) => frame.includes("Second answer"))
      await screen.setup.waitForVisualIdle({ quietFrames: 3 })
      expect(screen.footer("Build")).toContain("→ vendor/real-x")
      screen.setup.resize(24, 40)
      await screen.setup.renderOnce()
      await screen.setup.waitForVisualIdle({ quietFrames: 3 })
      const narrow = screen.setup.captureCharFrame()
      expect(narrow).toContain("Second answer")
      expect(narrow).not.toContain("→")
      expect(narrow).not.toContain(LABEL)
    },
    60_000,
  )

  // The live path (the client's own fold of the events), which the design flags as the easy one to forget: the arrow must
  // show without reloading the session. The first step has the field, the second does not.
  pending(
    "AM1.6-10, live: the arrow appears from the step events, with no reload",
    async () => {
      await using screen = await mount({ width: 100, messages: [turns()[0]] })
      await screen.setup.waitForFrame((frame) => frame.includes("First question"))
      const step = (seq: number, assistantMessageID: string, agent: string, resolvedModel?: string): OpenCodeEvent[] =>
        [
          {
            id: `evt_started_${seq}`,
            created: seq,
            type: "session.step.started",
            durable: { aggregateID: session.id, seq, version: 1 },
            data: { started: seq, sessionID: session.id, assistantMessageID, agent, model },
          },
          {
            id: `evt_text_${seq}`,
            created: seq,
            type: "session.text.started",
            durable: { aggregateID: session.id, seq: seq + 1, version: 1 },
            data: { sessionID: session.id, assistantMessageID, text: `Live answer ${seq}` },
          },
          {
            id: `evt_ended_${seq}`,
            created: seq,
            type: "session.step.ended",
            durable: { aggregateID: session.id, seq: seq + 2, version: 1 },
            data: {
              sessionID: session.id,
              assistantMessageID,
              finish: "stop",
              cost: 0,
              tokens: { input: 1, output: 1, reasoning: 0, cache: { read: 0, write: 0 } },
              ...(resolvedModel ? { resolvedModel } : {}),
            },
          },
        ] as unknown as OpenCodeEvent[]
      for (const event of step(10, "assistant-live-1", "build", "vendor/real-x")) screen.events.emit(event)
      await screen.setup.waitForFrame((frame) => frame.includes(`Build · ${LABEL}`))
      for (const event of step(20, "assistant-live-2", "plan")) screen.events.emit(event)
      await screen.setup.waitForFrame((frame) => frame.includes(`Plan · ${LABEL}`))
      await screen.setup.waitForVisualIdle({ quietFrames: 3 })
      expect(screen.footer("Build")).toContain(`Build · ${LABEL} → vendor/real-x`)
      expect(screen.footer("Plan")).not.toContain("→")
    },
    60_000,
  )
})
