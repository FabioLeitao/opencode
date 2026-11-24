import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { describe, expect, test } from "bun:test"
import { OpenCode, type OpenCodeEvent, type SessionMessageInfo } from "@opencode/client"
import { Effect, Scope } from "effect"
import { ServerFetch } from "../src/fetch"

// Acceptance tests (QA, black box) for the epic "resolved model" (design M1.6, AM1.6-1 to AM1.6-9, AM1.6-12 to AM1.6-14).
// The server runs in this process behind its public API; the provider is a fake OpenAI-compatible router on port 0.

// What the fake router puts in the `model` field of every chunk of one response.
const OMIT = Symbol("omit")
type Reported = string | number | null | object | typeof OMIT

const ROUTED_VIA = "header-secret-123"
const PROMPT_TOKENS = 11
const COMPLETION_TOKENS = 7

// The prompt text picks the case: the router reads `case:<name>` from the last user message.
const fakeRouter = (cases: Record<string, Reported>) => {
  const requests: { readonly requested: unknown; readonly case: string }[] = []
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      if (request.method !== "POST" || new URL(request.url).pathname !== "/v1/chat/completions")
        return new Response("not found", { status: 404 })
      const body = (await request.json()) as { model?: unknown; messages?: { role: string; content: unknown }[] }
      const last = JSON.stringify(body.messages?.findLast((message) => message.role === "user")?.content ?? "")
      const name = /case:(\w+)/.exec(last)?.[1] ?? "none"
      requests.push({ requested: body.model, case: name })
      const reported = cases[name] ?? OMIT
      const model = reported === OMIT ? {} : { model: reported }
      const chunks = [
        { id: "chatcmpl_fixture", ...model, choices: [{ delta: { role: "assistant", content: "Hello " } }] },
        { id: "chatcmpl_fixture", ...model, choices: [{ delta: { content: "from the router" } }] },
        { id: "chatcmpl_fixture", ...model, choices: [{ delta: {}, finish_reason: "stop" }] },
        {
          id: "chatcmpl_fixture",
          ...model,
          choices: [],
          usage: {
            prompt_tokens: PROMPT_TOKENS,
            completion_tokens: COMPLETION_TOKENS,
            total_tokens: PROMPT_TOKENS + COMPLETION_TOKENS,
          },
        },
      ]
      return new Response(`${chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("")}data: [DONE]\n\n`, {
        headers: { "content-type": "text/event-stream", "x-routed-via": ROUTED_VIA },
      })
    },
  })
  return { url: `http://127.0.0.1:${server.port}/v1`, requests, stop: () => server.stop(true) }
}

// The provider is declared the way an operator declares it: `npm: "@ai-sdk/openai-compatible"`, model `auto`.
const providerConfig = (url: string, extra: object = {}) =>
  JSON.stringify({
    model: "freellmapi/auto",
    provider: {
      freellmapi: {
        npm: "@ai-sdk/openai-compatible",
        name: "Router",
        options: { baseURL: url, apiKey: "test-key" },
        models: {
          auto: {
            name: "Auto",
            cost: { input: 3, output: 15 },
            limit: { context: 100_000, output: 10_000 },
          },
        },
      },
    },
    ...extra,
  })

type Scenario = {
  /** Reported model per case name. A case not listed reports no model. */
  readonly cases: Record<string, Reported>
  /** Extra top-level config, such as `experimental: { resolved_model: false }`. */
  readonly config?: object
}

type Assistant = Extract<SessionMessageInfo, { type: "assistant" }>
type Json = Record<string, unknown>
type Client = ReturnType<typeof OpenCode.make>
type Event = OpenCodeEvent

// Each test boots a server, a router and a prompt flow per scenario, so it names a 60 s budget (120 s for the ones with
// five or six steps) instead of the package's 5 s default.
const withScenario = async <A>(scenario: Scenario, use: (world: World) => Promise<A>) => {
  const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "opencode-resolved-model-")))
  const router = fakeRouter(scenario.cases)
  try {
    return await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const scope = yield* Scope.Scope
          const start = Effect.gen(function* () {
            const handler = yield* ServerFetch.make({
              app: { version: "test" },
              database: { path: path.join(dir, "opencode.db") },
              // Its own global config directory, so the developer's global config cannot leak in.
              config: { directory: dir, project: false, content: providerConfig(router.url, scenario.config ?? { experimental: { resolved_model: true } }) },
              models: { fetch: false },
              fs: { filewatcher: false },
            })
            return OpenCode.make({
              baseUrl: "http://opencode.local",
              fetch: Object.assign(
                (input: string | URL | Request, init?: RequestInit) => handler(new Request(input, init)),
                { preconnect: fetch.preconnect },
              ),
            })
          })
          const client = yield* start
          // A second server on the same database file, started when asked: it reads what the first one wrote.
          const reopen = () => Effect.runPromise(start.pipe(Scope.provide(scope)))
          return yield* Effect.promise(() => use(world(client, router, reopen)))
        }),
      ),
    )
  } finally {
    await router.stop()
    await fs.rm(dir, { recursive: true, force: true })
  }
}

type World = ReturnType<typeof world>

const world = (client: Client, router: ReturnType<typeof fakeRouter>, reopen: () => Promise<Client>) => ({
  client,
  router,
  reopen,
  /** Sends one prompt per case, in order, to a fresh session and waits for each step to finish. */
  async session(...caseNames: string[]) {
    const created = await client.session.create({ title: "Resolved model" })
    for (const name of caseNames) {
      await client.session.prompt({ sessionID: created.id, text: `Say hello case:${name}` })
      await client.experimental.session.wait({ sessionID: created.id })
    }
    return created.id
  },
  async assistants(sessionID: string, via: Client = client, sanitize = false) {
    const exported = await via.experimental.session.export({ sessionID, sanitize })
    return exported.messages.filter((message): message is Assistant => message.type === "assistant")
  },
})

// Collects the event stream. Waiting is driven by the events themselves; the deadline only turns a missing event into a failure.
const collectEvents = async (client: Client) => {
  const abort = new AbortController()
  const events: Event[] = []
  const waiters: { readonly matches: (event: Event) => boolean; readonly resolve: () => void }[] = []
  const done = (async () => {
    try {
      for await (const event of client.event.subscribe({ signal: abort.signal })) {
        events.push(event)
        waiters.filter((waiter) => waiter.matches(event)).forEach((waiter) => waiter.resolve())
      }
    } catch {
      // The stream ends with an abort when the collector stops.
    }
  })()
  const until = (matches: (event: Event) => boolean, label: string) =>
    new Promise<void>((resolve, reject) => {
      if (events.some(matches)) return resolve()
      const timer = setTimeout(() => reject(new Error(`no event: ${label}`)), 15_000)
      waiters.push({
        matches,
        resolve: () => {
          clearTimeout(timer)
          resolve()
        },
      })
    })
  await until((event) => event.type === "server.connected", "server.connected")
  return {
    events,
    until,
    stepEnded: () => events.filter((event) => event.type === "session.step.ended"),
    stop: async () => {
      abort.abort()
      await done
    },
  }
}

const resolved = (message: Assistant) => (message as unknown as Json).resolvedModel
const hasResolvedKey = (message: Assistant) => "resolvedModel" in message

// Values the router reports. The escapes are written out so the source file stays printable.
const ESC = "\u001b"
const BIDI_OVERRIDE = "\u202e"
const ZERO_WIDTH = "\u200b"
const encoded = (value: string) => new TextEncoder().encode(value).length
// Longer than 256 bytes, made of 2-byte (é) and 4-byte characters; `shift` moves where byte 256 falls.
const long = (shift: number) => `${"a".repeat(shift)}${"é😀".repeat(80)}`

describe("preparation (not pending: it must pass before the tasks exist)", () => {
  test("the fake router, the declared provider and the prompt flow work end to end", async () => {
    await withScenario({ cases: { real: "vendor/real-x" } }, async (w) => {
      const sessionID = await w.session("real")
      const [assistant] = await w.assistants(sessionID)
      expect(w.router.requests).toEqual([{ requested: "auto", case: "real" }])
      expect(assistant.model).toMatchObject({ providerID: "freellmapi", id: "auto" })
      expect(assistant.finish).toBe("stop")
      expect(JSON.stringify(assistant.content)).toContain("Hello from the router")
      expect(assistant.error).toBeUndefined()
      // Cost is configured on the requested model, so the cost checks below can tell a real number from zero.
      expect(assistant.cost).toBeGreaterThan(0)
      expect(assistant.tokens).toMatchObject({ input: PROMPT_TOKENS, output: COMPLETION_TOKENS })
    })
  }, 60_000)

  test("the event stream shows the finished step, and a server reading the same database exports the same messages", async () => {
    await withScenario({ cases: { real: "vendor/real-x" } }, async (w) => {
      const feed = await collectEvents(w.client)
      try {
        const sessionID = await w.session("real")
        await feed.until((event) => event.type === "session.step.ended", "session.step.ended")
        expect(feed.stepEnded()).toHaveLength(1)
        const again = await w.reopen()
        expect(await w.assistants(sessionID, again)).toEqual(await w.assistants(sessionID))
      } finally {
        await feed.stop()
      }
    })
  }, 60_000)

  test("a config that turns the flag off still starts the server and answers the prompt", async () => {
    await withScenario(
      { cases: { real: "vendor/real-x" }, config: { experimental: { resolved_model: false } } },
      async (w) => {
        const sessionID = await w.session("real")
        const [assistant] = await w.assistants(sessionID)
        expect(assistant.finish).toBe("stop")
        expect(assistant.error).toBeUndefined()
      },
    )
  }, 60_000)
})

describe("backend acceptance", () => {
  // AM1.6-1 (T1.1)
  test(
    "AM1.6-1: a router that reports another model leaves it on the assistant message of the export",
    async () => {
      await withScenario({ cases: { real: "vendor/real-x" } }, async (w) => {
        const [assistant] = await w.assistants(await w.session("real"))
        expect(assistant.model.id).toBe("auto")
        expect(resolved(assistant)).toBe("vendor/real-x")
      })
    },
    60_000,
  )

  // AM1.6-2 (T1.2). The second step is the control: without it, "no key" would also pass with no feature at all.
  test(
    "AM1.6-2: a router that reports the requested model leaves no resolvedModel key",
    async () => {
      await withScenario({ cases: { same: "auto", real: "vendor/real-x" } }, async (w) => {
        const [same, control] = await w.assistants(await w.session("same", "real"))
        expect(same.model.id).toBe("auto")
        expect(hasResolvedKey(same)).toBe(false)
        expect(resolved(control)).toBe("vendor/real-x")
      })
    },
    60_000,
  )

  // AM1.6-3 (T1.3): the ESC goes, the rest of the sequence stays as inert text (plan T1.3, adjusted).
  test(
    "AM1.6-3: control characters, bidi and zero-width marks are stripped before the value is stored",
    async () => {
      await withScenario({ cases: { dirty: `${ESC}[31mvendor/x${BIDI_OVERRIDE}${ZERO_WIDTH}` } }, async (w) => {
        const [assistant] = await w.assistants(await w.session("dirty"))
        expect(resolved(assistant)).toBe("[31mvendor/x")
      })
    },
    60_000,
  )

  // AM1.6-4 (T1.4): sanitize before comparing with the requested model.
  test(
    "AM1.6-4: auto plus a zero-width mark equals the requested model once sanitized, so it is omitted",
    async () => {
      await withScenario({ cases: { masked: `auto${ZERO_WIDTH}`, real: "vendor/real-x" } }, async (w) => {
        const [masked, control] = await w.assistants(await w.session("masked", "real"))
        expect(hasResolvedKey(masked)).toBe(false)
        expect(resolved(control)).toBe("vendor/real-x")
      })
    },
    60_000,
  )

  // AM1.6-5 (T1.5): four alignments put byte 256 in the middle of a character; the last value is exactly 256 bytes.
  test(
    "AM1.6-5: a huge value is cut at 256 UTF-8 bytes without splitting a character",
    async () => {
      const exact = `${"a".repeat(256 - encoded("é😀"))}é😀`
      const values = { v0: long(0), v1: long(1), v2: long(2), v3: long(3), exact }
      expect(encoded(exact)).toBe(256)
      await withScenario({ cases: values }, async (w) => {
        const messages = await w.assistants(await w.session(...Object.keys(values)))
        Object.values(values).forEach((sent, index) => {
          const stored = resolved(messages[index])
          expect(typeof stored).toBe("string")
          const text = stored as string
          expect(encoded(text)).toBeLessThanOrEqual(256)
          expect(text).not.toContain("\ufffd")
          expect(sent.startsWith(text)).toBe(true)
          // Nothing is cut that did not have to be: the next character would not have fit.
          if (text !== sent) expect(encoded(text) + encoded([...sent.slice(text.length)][0] ?? "")).toBeGreaterThan(256)
        })
        expect(resolved(messages[4])).toBe(exact)
      })
    },
    120_000,
  )

  // AM1.6-6 (T1.6). The last step is the control that the feature works at all; the earlier ones must not break the stream.
  test(
    "AM1.6-6: a router with no model, an empty one or a non-string one does not hurt the stream",
    async () => {
      const cases: Record<string, Reported> = {
        none: OMIT,
        empty: "",
        number: 42,
        nothing: null,
        object: { id: "x" },
        real: "vendor/real-x",
      }
      await withScenario({ cases }, async (w) => {
        const messages = await w.assistants(await w.session(...Object.keys(cases)))
        expect(messages).toHaveLength(6)
        messages.slice(0, 5).forEach((assistant) => {
          expect(JSON.stringify(assistant.content)).toContain("Hello from the router")
          expect(assistant.finish).toBe("stop")
          expect(assistant.error).toBeUndefined()
          expect(hasResolvedKey(assistant)).toBe(false)
        })
        expect(resolved(messages[5])).toBe("vendor/real-x")
      })
    },
    120_000,
  )

  // AM1.6-7 (T1.7): cost and tokens follow the requested model, whatever the router reports.
  test(
    "AM1.6-7: cost and tokens of a step do not change with the reported model",
    async () => {
      await withScenario({ cases: { same: "auto", real: "vendor/real-x" } }, async (w) => {
        const [same, real] = await w.assistants(await w.session("same", "real"))
        expect(resolved(real)).toBe("vendor/real-x")
        expect(real.cost).toBeGreaterThan(0)
        expect(real.cost).toBe(same.cost)
        expect(real.tokens).toEqual(same.tokens)
      })
    },
    60_000,
  )

  // AM1.6-8 (T1.8): the response header must not reach the export or the durable event.
  test(
    "AM1.6-8: a response header of the router appears neither in the export nor in the step event",
    async () => {
      await withScenario({ cases: { real: "vendor/real-x" } }, async (w) => {
        const feed = await collectEvents(w.client)
        try {
          const sessionID = await w.session("real")
          await feed.until((event) => event.type === "session.step.ended", "session.step.ended")
          const [event] = feed.stepEnded()
          // The control: the feature ran, so the leak would have had a place to go.
          expect((event.data as unknown as Json).resolvedModel).toBe("vendor/real-x")
          expect(JSON.stringify(event)).not.toContain(ROUTED_VIA)
          expect(JSON.stringify(await w.client.experimental.session.export({ sessionID }))).not.toContain(ROUTED_VIA)
        } finally {
          await feed.stop()
        }
      })
    },
    60_000,
  )

  // AM1.6-12 (flag, config form). The default server is the control that the field exists when the flag is on.
  test(
    "AM1.6-12: experimental.resolved_model: false keeps the field out of the export",
    async () => {
      const cases = { real: "vendor/real-x" }
      await withScenario({ cases, config: { experimental: { resolved_model: false } } }, async (off) => {
        const [assistant] = await off.assistants(await off.session("real"))
        expect(assistant.model.id).toBe("auto")
        expect(hasResolvedKey(assistant)).toBe(false)
      })
      await withScenario({ cases }, async (on) => {
        const [assistant] = await on.assistants(await on.session("real"))
        expect(resolved(assistant)).toBe("vendor/real-x")
      })
    },
    120_000,
  )

  // AM1.6-13 (T1.11)
  test(
    "AM1.6-13: in a session of two steps only the step that differs has the field, also with sanitize",
    async () => {
      await withScenario({ cases: { real: "vendor/real-x", same: "auto" } }, async (w) => {
        const sessionID = await w.session("real", "same")
        for (const sanitize of [false, true]) {
          const [first, second] = await w.assistants(sessionID, w.client, sanitize)
          expect(resolved(first)).toBe("vendor/real-x")
          expect(hasResolvedKey(second)).toBe(false)
        }
      })
    },
    60_000,
  )

  // AM1.6-14 (T1.12). No public API rebuilds the projection, so this checks the two things a client can see: the durable
  // event carries the value the message has, and a second server reading the same database shows the same message.
  // The rebuild itself is DM1.6-21 (packages/core).
  test(
    "AM1.6-14: the durable event, the live message and a second server over the same database agree",
    async () => {
      await withScenario({ cases: { real: "vendor/real-x" } }, async (w) => {
        const feed = await collectEvents(w.client)
        try {
          const sessionID = await w.session("real")
          await feed.until((event) => event.type === "session.step.ended", "session.step.ended")
          const [event] = feed.stepEnded()
          const [live] = await w.assistants(sessionID)
          const [cold] = await w.assistants(sessionID, await w.reopen())
          expect((event.data as unknown as Json).resolvedModel).toBe("vendor/real-x")
          expect(resolved(live)).toBe("vendor/real-x")
          expect(resolved(cold)).toBe("vendor/real-x")
        } finally {
          await feed.stop()
        }
      })
    },
    60_000,
  )
})

describe("regression guard (passes before and after the tasks)", () => {
  // AM1.6-9 (T1.9): a session recorded before the field existed still imports and exports unchanged.
  test("AM1.6-9: an old session imports and exports with no error and no resolvedModel", async () => {
    await withScenario({ cases: {} }, async (w) => {
      const user: SessionMessageInfo = {
        id: "msg_old_user",
        type: "user",
        text: "Old question",
        time: { created: 100 },
      }
      const old: SessionMessageInfo = {
        id: "msg_old_assistant",
        type: "assistant",
        agent: "build",
        model: { providerID: "freellmapi", id: "auto" },
        content: [{ type: "text", text: "Old answer" }],
        finish: "stop",
        time: { created: 110, completed: 120 },
      }
      const template = await w.client.session.create({ title: "Old session" })
      const sessionID = "ses_old_before_resolved_model"
      await w.client.experimental.session.import({ info: { ...template, id: sessionID }, messages: [user, old] })
      const exported = await w.client.experimental.session.export({ sessionID })
      expect(exported.messages).toEqual([user, old])
      expect(exported.messages.some((message) => "resolvedModel" in message)).toBe(false)
      // The old session also opens as a normal one, and it can take a new prompt.
      expect((await w.client.session.message.get({ sessionID, messageID: old.id })).type).toBe("assistant")
    })
  }, 60_000)
})
