---
name: acceptance-harness-opencode
description: How black-box acceptance tests are built in the opencode fork (server in-process + fake router, tui full-app fixture, test.failing for pending)
metadata:
  type: project
---

- Pending mark is `test.failing` (bun:test); a negative assertion ("no key") passes today and would break the run, so each one carries a positive control step (a differing model in the same scenario).
- Backend black-box: `ServerFetch.make` (packages/server/src/fetch) in process + `OpenCode.make` client with a fetch bridge; fake provider = `Bun.serve` port 0 on `/v1/chat/completions`; legacy config (`provider.<id>.npm/options/models`) works. `client.event.subscribe({ signal })` takes ONE arg (the shared-events wrapper); a second arg is ignored and abort never ends the loop.
- No public API rebuilds the session projection; import inserts rows directly. Rebuild stays a core test (DM1.6-21).
- packages/core `bun run test` hangs (40 files, issue #2): put new tests in server/tui/client/cli, never in the hanging list. `packages/server` baseline has 4 failures in vcs.test.ts (pre-existing).
- Run with Bun 1.4.4 via an npm-installed bun in the session scratchpad; `git push origin <branch>:<branch>` runs `bun run check` (needs PATH). Work in a worktree under the scratchpad, `bun install --frozen-lockfile` takes ~3 min.
**Why:** saves rediscovering the harness for the next epic tests (M2 images). **How to apply:** reuse the `withScenario`/`collectEvents` shape in packages/server/test/resolved-model.test.ts on branch `resolved-model`.
