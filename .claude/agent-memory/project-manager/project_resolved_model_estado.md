---
name: project_resolved_model_estado
description: Estado do projeto "modelo real do roteador" no fork opencode: decisões, travas do upstream, PDFs enviados e próximos passos
metadata:
  type: project
---

Projeto: registrar o model real quando o provider é roteador (`freellmapi/auto`) no fork `FabioLeitao/opencode`; Objetivo 2 é avaliação de imagens acumuladas. Brief veio da sessão Owl (`t14-real[Owl]`), em nome do operador, 2026-11-23. Detalhe em `docs/description.md` e `docs/plano.md` (branch `gestao`).

**Decisões do operador (2026-11-23):** gerência no branch `gestao` do fork; um branch de épico `resolved-model` e um PR por objetivo; executor `opencode` no herdr (TUI), fallback `pi`, depois `cursor` só se a franquia semanal foi renovada, `agy` candidato.
**Why:** a `dev` do fork espelha o upstream e o brief proíbe worktree; a regra global do operador é uma PR por épico.
**How to apply:** nunca commitar gerência na `dev` nem em branch de patch; `gestao` não tem upstream de rastreamento, push sempre `git push origin gestao:gestao`.

**Travas:** todo `gh` de escrita com `--repo FabioLeitao/opencode` (clone sem repo padrão, dois remotos). NADA no upstream (`anomalyco/opencode`) sem o "vai" do operador. Referência ao upstream no fork vai entre crases, sem link. O comentário de desenho já foi postado pelo Owl na `#60309` (comentário 7118094794), e o desenho tem de bater com as 8 promessas dele (listadas em `docs/description.md`).

**Regras de brief de dev externo (operador, via Owl, 2026-11-23):** todo brief leva a linha "Do not open, comment on, react to or close anything in anomalyco/opencode (the upstream). Issues and PRs go only to the fork."; opencode, pi, goose, cline, zero e hermes passam pelo FreeLLMAPI e começam no Auto; agy, codex, cursor, grok e dsh usam conta própria; registrar no evento conta e modelo que escreveram o patch. Texto completo em `docs/operacao.md`.

**Fatos de código (upstream/dev 553c14178):** `packages/core/src/aisdk.ts:754` descarta `response-metadata`; `session.step.ended` em `packages/schema/src/session-event.ts:372` é o lar natural do campo. Aberto para o arquiteto: o `freellmapi` passa pelo `aisdk.ts` ou por protocolo do `packages/ai`?

**Estado em 2026-11-23:** plano em rascunho, NÃO aprovado, nada publicado como issue. PDFs gerados: `docs/visao-projeto-2026-11-23.pdf` (título "Plano do projeto para aprovação") e `docs/perguntas-cliente-r1-2026-11-23.pdf` (P4, P5, P6). P8 respondida por fato (Owl): o FreeLLMAPI `:3001` é o roteador de PRODUÇÃO, só como cliente normal, janela combinada com o `fla-pm`, conferência no `freeapi.db` somente leitura. Em aberto no chat: P7 (CI do fork) e P9 (destino do merge da PR do épico: recomendação do Owl é um branch de integração `local` no fork, com a `dev` espelho do upstream; criar o `local` só com o ok do operador).
**Próximo:** operador aprova o plano pelo PDF → publicar issues (`publicar-tarefas`, rótulos `backend`, `ux`, `qa`, `gestão`, `dev-externo`, criá-los no fork) → F0.2 baseline → arquiteto desenha o épico → QA → liberação.
