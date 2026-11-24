---
name: project-pontos-frageis
description: Pontos frágeis do opencode v2 que já enganaram o plano: rota nativa vs aisdk.ts, dobra duplicada no client, flag desligada em release, hook de pre-push
metadata:
  type: project
---

- O plano do M1 supôs a captura em `packages/core/src/aisdk.ts`, mas `AISDKNative.rewrite` troca `@ai-sdk/*` (mesmo com prefixo `aisdk:`) pelos protocolos nativos de `packages/ai`. O `aisdk.ts` só atende pacotes fora do mapa.
  **Why:** a premissa errada estava no plano e na promessa pública da `anomalyco/opencode#60309` (desenho M1.6, 2026-11-23).
  **How to apply:** antes de desenhar algo sobre stream de provider, rode o rewrite com o config real e confira a rota.
- O read model do assistente é dobrado em dois lugares: `packages/core/src/session/message-updater.ts` e `packages/client/src/solid/data.ts`, que é escrito à mão. Um campo novo vai nos dois, com o reset em `session.step.started`.
- As flags de `packages/schema/src/config/flag.ts` nascem desligadas em release. A validação ponta a ponta precisa de um build local ou dev, ou de `OPENCODE_FLAGS`.
- O `git push` do `gestao` roda o pre-push do upstream (`bun run check`, cerca de 35 s), mesmo num commit só de docs. Sem `bun` no PATH ele falha. Não use `--no-verify`: ponha um `bun` 1.4.4 no PATH.
