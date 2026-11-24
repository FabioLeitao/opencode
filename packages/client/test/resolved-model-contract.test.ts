import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "bun:test"

// Acceptance tests (QA, black box) for AM1.6-15 (T1.13) of the epic "resolved model" (design M1.6): the generated client
// is the public contract, so these read the generated files and run the generator, nothing of the implementation.
// The test marked `pending` is the acceptance of task M1.1 (#6) and uses `test.failing`: the run breaks when it starts to
// pass, so whoever implements the task has to remove the mark.

const pending = test.failing
const root = path.join(import.meta.dir, "..")
const generated = ["src/promise/generated", "src/effect/generated"].map((directory) => path.join(root, directory))

const block = (source: string, start: string) => {
  const from = source.indexOf(start)
  if (from === -1) throw new Error(`generated types.ts has no "${start}"`)
  return source.slice(from, source.indexOf("\n}\n", from))
}

// A hash of every generated file, to compare two generations.
const fingerprint = async () => {
  const files = (
    await Promise.all(
      generated.map(async (directory) => (await fs.readdir(directory)).map((name) => path.join(directory, name))),
    )
  ).flat()
  const hash = createHash("sha256")
  for (const file of files.toSorted()) hash.update(file).update(await Bun.file(file).bytes())
  return hash.digest("hex")
}

describe("generated client contract (AM1.6-15)", () => {
  pending(
    "AM1.6-15: the generated client has resolvedModel on the step event and on the assistant message, and the flag in the config",
    async () => {
      const types = await Bun.file(path.join(root, "src/promise/generated/types.ts")).text()
      expect(block(types, "export type SessionStepEnded = {")).toMatch(/resolvedModel\?: string/)
      expect(block(types, "export type SessionMessageAssistant = {")).toMatch(/resolvedModel\?: string/)
      expect(types).toMatch(/resolved_model\?: boolean/)
    },
  )

  // Passes before the tasks too, because a clean checkout is already in sync. It guards the day the schema changes and the
  // generated files are forgotten: the second generation would then differ from what is committed.
  test("AM1.6-15: running bun run generate again leaves the generated client as it is", async () => {
    const before = await fingerprint()
    const run = Bun.spawn([process.execPath, "run", "generate"], { cwd: root, stdout: "pipe", stderr: "pipe" })
    const [stderr, code] = await Promise.all([new Response(run.stderr).text(), run.exited])
    // `bun run` echoes the command on stderr, so only the exit code is asserted; the message helps when it fails.
    expect({ code, stderr: code === 0 ? "" : stderr }).toEqual({ code: 0, stderr: "" })
    expect(await fingerprint()).toBe(before)
  }, 120_000) // The generator compiles the whole API; allow for a loaded runner.
})
