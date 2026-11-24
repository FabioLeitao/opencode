# Descrição do projeto: modelo real do roteador no opencode

> Cliente e product owner: o operador (Fabio Leitao). O brief chegou pelo chat, por mensagem da sessão
> `t14-real[Owl]` (Owl → oc-pm), em 2026-11-23, com as palavras do operador. Guardado aqui como pede o fluxo.

## Brief original (2026-11-23)

Palavras do operador: "bora resolver localmente, semelhante ao que já sabemos fazer no zero, só que no opencode...
issue e PR no fork local (sempre) e quando confirmarmos, o agente faz o PR upstream seguindo as regras de contributing deles".

### Repositório

- Clone canônico: `~/Projects/dev/opencode`. `origin` = `FabioLeitao/opencode` (fork público, issues habilitadas).
  `upstream` = `anomalyco/opencode`. A `dev` do fork espelha o upstream.
- Fluxo: issue e PR sempre no fork. O branch do patch nasce de `upstream/dev` e os arquivos de gerência
  (plano, custos, memória) nunca entram nele. Só depois de validado localmente e com o "vai" do operador sai o
  PR no upstream, seguindo o `CONTRIBUTING.md` deles.

### Objetivo 1: registrar o model REAL quando o provider é um roteador

- Hoje o opencode grava só `modelID: "auto"` e `providerID: "freellmapi"` (conferido pelo Owl em
  `~/.local/share/opencode/opencode.db`, tabela `message`).
- O FreeLLMAPI (`:3001`) devolve o model real no campo `model` do corpo e dos chunks e no header `X-Routed-Via`.
  O AI SDK entrega `response.modelId`, mas o opencode descarta.
- Meta: guardar `response.modelId` como metadado opcional do passo ou turno do assistente e mostrá-lo no TUI e no
  `opencode session export`. Não guardar headers crus.
- Referências upstream (em `anomalyco/opencode`): #60309 (aberta, v2.x, pede isto e cita o FreeLLMAPI; há um
  segundo relato com `openrouter/auto` na 2.3.0); #42420 (v1, fechada como NOT_PLANNED na migração para a 2.0, com
  convite para reabrir na 2.x); PRs v1 fechadas sem merge: #42433, #49317 e #49571; #45008 (outra tentativa v1, com um
  `responseModelID` mais amplo); #26091 (headers de resposta descartados, mais amplo, fora de escopo).
- Precedente nosso: PR `Twigpine/zero#1234` (`resolvedModel` no zero). O mantenedor pediu o formato SIMPLES: capturar o
  model do chunk de usage, sem segurar evento e sem drain no collector.

### Objetivo 2 (depois, menor): imagem acumulada no histórico

- Com o FreeLLMAPI sem modelo de visão disponível, toda chamada cai em 429. O conserto principal é no FreeLLMAPI
  (com o `fla-pm`).
- Do lado do opencode, avaliar: (a) se `modalities: {input:["text"]}` no model `freellmapi/auto` do `opencode.json`
  já faz o opencode não mandar a imagem; (b) a relação com `anomalyco/opencode#54784` (413 por imagens acumuladas).

### Regras da casa (do brief)

- CONTRIBUTING upstream: mudança de núcleo exige revisão de desenho ANTES (PR que ignora é fechada). Primeiro um
  comentário na #60309 com o desenho, e só com o "vai" do operador.
- NADA no upstream (issue, comentário, PR, reação) sem o "vai" do operador.
- Dev externo: só TUI no herdr, nunca headless; modelo Auto do FreeLLMAPI primeiro.
- Ritual de fechamento de épico (`projectAgents#104`): três revisões, gate no SHA exato, CI verde e merge só por
  `merge-green`.
- Pré-voo no Buildbot: este repo NÃO tem builder. Declarar `Pré-voo: modo=desligado (sem builder)` até o operador
  pedir um. O gate local é o do repo: `bun install`, `bun test` e typecheck do pacote tocado.
- Sem worktree; branch no clone canônico.

## Desenho já proposto no upstream (comentário do Owl, 2026-11-23)

Postado pelo Owl, por ordem do operador, em `anomalyco/opencode#60309` (comentário 7118094794). **O desenho deve bater
com o que foi prometido lá:**

1. Campo OPCIONAL nos metadados do passo ou da mensagem do assistente, a partir do `response.modelId` do AI SDK.
2. Tratado como texto não confiável: tira caracteres de controle e de formatação, teto de 256 bytes sem partir
   caractere, e sanitiza ANTES de comparar.
3. Omitido quando igual ao model pedido.
4. Exibido no TUI e no `session export` só quando difere (ex.: `freellmapi/auto → <resolved>`).
5. Custo e limites continuam pelo model pedido.
6. Sem headers crus.
7. Testes: escape sequence, valor gigante e "igual ao pedido".
8. Disposto a mover o campo para onde o mantenedor preferir no `packages/schema`.

Dito com honestidade lá: a PR do zero (#1234) ainda não foi mesclada, e o mantenedor pediu o formato simples.

## Decisões do operador no chat (2026-11-23)

- **Gerência:** os arquivos de gerência ficam no branch `gestao` do fork, que nunca é mesclado na `dev` nem nos patches.
- **PRs:** um branch de épico por objetivo, saído de `upstream/dev`, com um único PR; os testes do QA e a implementação
  entram nele em commits ordenados (testes primeiro). Nada mescla na `dev` do fork.
- **Executor:** `opencode` no herdr, só TUI, modelo Auto do FreeLLMAPI primeiro (skill `operar-opencode`).
- **Fallback do executor (mensagem do operador, mesmo dia):** `pi` como fallback do `opencode`. O `cursor` talvez,
  se já tiver refil da franquia semanal de tokens. O `agy` também é bom como harness, "acho". Entram em
  `docs/operacao.md` nessa ordem; o `agy` fica como candidato até o operador confirmar, e o `cursor` só com a
  justificativa escrita por tarefa que a regra de uso dele exige.

## Respostas do cliente

(nenhuma rodada de formulário respondida ainda)

## Aprovação do plano

(pendente: o plano ainda não foi aprovado pelo cliente)
