# Decisões técnicas

Registro de decisões (ADR) do fork `FabioLeitao/opencode`. Cada uma tem número, data, status, contexto, decisão,
consequências e quem decidiu. Mantido pelo arquiteto-senior, no branch `gestao`.

## ADR-001: capturar o model real no protocolo nativo OpenAI Chat

- **Data:** 2026-11-23 · **Status:** aceita · **Decidiu:** arquiteto-senior (desenho `docs/desenho/M1.6.md`)
- **Contexto:** o plano supunha a captura no `packages/core/src/aisdk.ts` (`response-metadata`). Mas o
  `@ai-sdk/openai-compatible` do `freellmapi` é trocado por `@opencode/ai/providers/openai-compatible`
  (`AISDKNative.rewrite`), que usa o `OpenAIChat.protocol` do `packages/ai`. O `openrouter` também reusa esse stream.
- **Decisão:** ler o `model` do chunk na função `step` de `packages/ai/src/protocols/openai-chat.ts`, guardá-lo no
  `ParserState` e entregá-lo como `responseModel` no `step-finish`. O `aisdk.ts` ganha uma captura igual a partir do
  `response-metadata`, para os pacotes do AI SDK que continuam nesse caminho.
- **Consequências:** uma captura cobre `freellmapi`, `openrouter` e os demais OpenAI-compatíveis de Chat. Os outros
  protocolos nativos (Responses, Anthropic, Gemini) ficam sem o campo. Isso diverge da promessa 1 da
  `anomalyco/opencode#60309` ("a partir do `response.modelId` do AI SDK"), e a divergência foi levada ao PM.

## ADR-002: "igual ao pedido" compara com o id enviado no fio

- **Data:** 2026-11-23 · **Status:** aceita · **Decidiu:** arquiteto-senior
- **Contexto:** o pedido tem dois ids: o `ref.id` do catálogo e o `LanguageModel.id` que vai no `model` do corpo da
  requisição. Os dois diferem quando o catálogo tem alias.
- **Decisão:** comparar o valor já sanitizado, por igualdade exata, com o `LanguageModel.id` (`input.model.model.id` em
  `step.ts`).
- **Consequências:** um provider que devolve o id que recebeu não gera seta. Um provider que devolve um id de snapshot
  (`gpt-4o` → `gpt-4o-2024-08-06`) gera. Isso fica como pergunta ao mantenedor, sem heurística de prefixo.

## ADR-003: campo `resolvedModel` no passo, fora da chave `experimental`, com a flag `resolved_model`

- **Data:** 2026-11-23 · **Status:** aceita · **Decidiu:** arquiteto-senior
- **Contexto:** o `AGENTS.md` pede eventos duráveis mínimos, uma flag para comportamento novo visível e a chave
  `experimental` para campo experimental em endpoint estável. Um evento durável é reproduzido para sempre. Se o campo
  morasse em `experimental`, a graduação obrigaria a renomear o que já está gravado.
- **Decisão:** `resolvedModel` opcional no `session.step.ended` (o fato durável) e no `SessionMessage.Assistant` (o read
  model que o TUI, o export e os plugins leem). Uma flag `resolved_model` em `packages/schema/src/config/flag.ts`, lida
  uma vez em `step.ts`, marca o comportamento como experimental.
- **Consequências:** em release a flag fica desligada e o campo não é gravado. Graduar é apagar a flag. O mantenedor
  pode pedir outro lugar ou a chave `experimental` (promessa 8 da `#60309`).

## ADR-004: regras de sanitização do model informado pelo provider

- **Data:** 2026-11-23 · **Status:** aceita · **Decidiu:** arquiteto-senior
- **Contexto:** o valor vem do outro lado da conexão e acaba no terminal. A promessa 2 da `#60309` fixa: sem controle nem
  formatação, no máximo 256 bytes sem partir caractere, e sanitizar antes de comparar.
- **Decisão:** remover os pontos de código de `\p{Cc}`, `\p{Cf}`, `\p{Cs}`, `\p{Zl}` e `\p{Zp}`; fazer trim; cortar em
  256 bytes UTF-8 por ponto de código; vazio ou igual ao pedido vira ausente. Só os caracteres saem: `ESC[31m` vira
  `[31m`.
- **Consequências:** é a mesma regra do precedente `Twigpine/zero#1234`. O `session import` continua aceitando o valor
  sem sanitizar, e isso fica fora do escopo.
