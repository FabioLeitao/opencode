# Plano: modelo real do roteador no opencode

Atualizado em 2026-11-23. Status: **aprovado pelo cliente em 2026-11-23** ("pro mim, ok no plano"); tarefas publicadas como issues no fork.
Cliente e product owner: o operador. Fonte dos requisitos: `docs/description.md`.

## Resumo

Quando o provider é um roteador (`freellmapi/auto`, `freellmapi/fusion`, `openrouter/auto`), o opencode grava só o model
pedido e descarta o que o roteador escolheu de fato. O trabalho tem dois objetivos, num fork público
(`FabioLeitao/opencode`) com issue e PR sempre no fork, e só depois, com o "vai" do operador, um PR no upstream
(`anomalyco/opencode`).

1. **Objetivo 1 (módulo M1):** guardar o model real (`response.modelId` do AI SDK) como campo opcional do passo do
   assistente, sanitizado e omitido quando igual ao pedido, e mostrá-lo no TUI e no `opencode session export` só quando
   difere. O desenho já foi prometido no upstream, no comentário do Owl na `#60309`, e o plano tem de bater com ele.
2. **Objetivo 2 (módulo M2):** avaliar, sem código, se `modalities: {input:["text"]}` no `freellmapi/auto` impede o
   opencode de reenviar imagens acumuladas, e a relação com `anomalyco/opencode#54784`.

Entrega em quatro etapas: F0 (preparação do fork e do fluxo), M1 (um branch de épico, um PR), M2 (relatório) e U1
(proposta ao upstream, travada pelo mantenedor e pelo "vai").

### Pontos técnicos já verificados no código (`upstream/dev` 553c14178), para o arquiteto

- `packages/core/src/aisdk.ts:754` descarta hoje a parte `response-metadata` do stream do AI SDK, que é onde chega o
  `modelId`. O `finish` também é ignorado em `packages/core/src/session/runner/publish-llm-event.ts:564`.
- O evento durável `session.step.ended` (`packages/schema/src/session-event.ts:372`) já carrega `finish`, `rawFinish`,
  `native`, `cost` e `tokens`, e é o lar natural do campo opcional. O arquiteto decide.
- O `packages/ai` tem protocolos próprios. **Pergunta ao arquiteto:** o `freellmapi` (OpenAI-compatível) passa pelo
  caminho do `aisdk.ts` ou por um protocolo do `packages/ai`? A captura tem de ficar no caminho que ele usa de fato.

### Restrições do repositório que mudam o desenho (do `AGENTS.md`)

- Eventos duráveis mínimos: registrar só o fato novo irredutível. Novo comportamento visível pede flag em
  `packages/schema/src/config/flag.ts`, lida com `Flag.enabled`; campo experimental vai sob a chave `experimental`.
- Dependências: Schema → Core e Protocol → Server. O Client nunca depende de Core nem de Server.
- Depois de mudar o Protocol ou a API do Server: `bun run generate` em `packages/client`.
- Vocabulário: "step" é uma chamada lógica ao LLM; "turn" não se usa para uma chamada só.
- Tokens de tema do TUI por papel semântico. Sem `any`, sem import com alias, sem `else`, sem `try/catch` evitável.
- Testes: sem mock além do necessário, nada de `globalThis.*`, rodar a partir do pacote.

## Requisitos

Funcionais, Objetivo 1 (M1):
- **R1** Guardar o model real (`response.modelId` do AI SDK) como campo OPCIONAL nos metadados do passo do assistente.
- **R2** Tratar o valor como texto não confiável: remover caracteres de controle e de formatação, limitar a 256 bytes
  (UTF-8, sem partir caractere) e sanitizar ANTES de comparar.
- **R3** Omitir o campo quando, depois de sanitizado, for igual ao model pedido.
- **R4** Mostrar no TUI `provider/model → resolved` só quando difere. *(depende de P4)*
- **R5** Incluir o campo no `opencode session export` quando presente. *(depende de P4)*
- **R6** Custo e limites continuam calculados pelo model pedido.
- **R7** Não guardar nenhum header cru.
- **R8** O campo é opcional e aditivo: sessões já gravadas e clientes que o ignoram seguem funcionando. *(depende de P5)*
- **R9** O campo vive em `packages/schema`, em lugar e nome definidos no desenho e movíveis conforme o mantenedor; o
  cliente gerado fica regenerado.

Não funcionais e de processo:
- **R10** Seguir o `AGENTS.md` (flag quando couber, estilo, direção das dependências, sem Changesets).
- **R11** Validar ponta a ponta, local, contra o FreeLLMAPI `:3001` com `auto`: evidência do model real no banco, no TUI
  e no export.
- **R12** O desenho bate com as oito promessas do comentário da `#60309`. Divergência vai ao operador antes de codar.
- **R13** Issue e PR no fork; branch do épico nascido de `upstream/dev`; nenhum arquivo de gerência no branch; nada no
  upstream sem o "vai".
- **R14** Formato SIMPLES, como o mantenedor pediu no precedente: sem buffering extra, diff pequeno.
- **R15** Valor ausente ou inválido nunca atrasa nem derruba o stream.
- **R16** PR upstream (U1.1) segue o `CONTRIBUTING.md`: título `type(scope): summary`, template preenchido, descrição
  curta, só depois da resposta do mantenedor e do "vai".

Objetivo 2 (M2):
- **R17** Determinar se `modalities: {input:["text"]}` faz o opencode não enviar a imagem, e a relação com a `#54784`,
  em relatório, sem código. *(depende de P6)*

## Timeline

### F0: Preparação do fork e do fluxo

- **F0.1** *(gestão)* Branch `gestao`, `docs/operacao.md` com o modo e as travas, `.gitattributes` com `*.pdf binary`,
  memória do PM. Atende R13. **Feito em 2026-11-23**, falta só o push do `gestao`.
- **F0.2** *(qa)* Baseline do gate local em `upstream/dev`: `bun install`, `bun typecheck` e `bun run test` nos pacotes
  que o épico vai tocar (`schema`, `core`, `tui`, `cli`, `client`), para saber o que já falha antes de mexer. Atende R10, R11.
- **F0.3** *(gestão)* Verificar o que roda de CI do GitHub num PR do fork (Actions está habilitado) e registrar o
  resultado em `docs/operacao.md`. Atende R13. *(depende de P7)*

### M1: Modelo real do roteador (um branch de épico `resolved-model`, um PR no fork)

O arquiteto escreve um desenho para o épico inteiro, na issue do épico, antes de qualquer código. O QA escreve os
testes de aceitação como commits do branch, pendentes, e o dev os liga um a um (TDD). Cada tarefa abaixo é uma issue.

- **M1.1** *(backend)* Schema: campo opcional do model real no passo do assistente, em `packages/schema`, com a flag
  que o desenho decidir, e `bun run generate` em `packages/client`. Atende R1, R8, R9, R10. *(o lugar final do
  campo pode mudar conforme o mantenedor; depende de P5)*
- **M1.2** *(backend)* Captura e sanitização: ler o model id real no caminho que o `freellmapi` usa de fato, sanitizar
  (R2) antes de comparar, omitir se igual (R3), publicar no evento do passo e refletir na projeção e no atualizador de
  mensagens, sem tocar em custo e limites (R6) e sem header cru (R7). Atende R1, R2, R3, R6, R7, R14, R15.
- **M1.3** *(ux)* TUI: mostrar `provider/model → resolved` onde o model já aparece, só quando difere, com tokens de tema
  semânticos e testes de renderização em largura estreita e larga. Atende R4. *(depende de P4)*
- **M1.4** *(backend)* `opencode session export`: incluir o campo quando presente. Atende R5. *(depende de P4)*
- **M1.5** *(qa)* Validação ponta a ponta contra o FreeLLMAPI `:3001` com `auto` (banco, TUI e export), e checagem final
  do gate no SHA exato do épico. Atende R11. A janela de uso do `:3001` se combina com o `fla-pm`. *(depende de P9)*

- **M1.6** *(backend, arquiteto)* Desenho técnico do épico, publicado na issue desta tarefa antes de qualquer código:
  caminho de captura que o `freellmapi` usa de fato, nome e lugar do campo em `packages/schema`, flag e chave
  `experimental`, onde o TUI e o export leem o campo, e conferência contra as oito promessas da `#60309`. Atende R9,
  R10, R12. *(tarefa acrescentada na aprovação, em 2026-11-23; o ID segue o próximo livre, mas o desenho vem primeiro)*
- **M1.7** *(qa)* Testes de aceitação de caixa-preta do épico (T1.1 a T1.13), escritos a partir do desenho e entregues
  como commits do branch `resolved-model`, pendentes, antes da implementação. Atende R1 a R9, R15. *(acrescentada na
  aprovação, em 2026-11-23)*

Ordem do épico: M1.6 (desenho) → M1.7 (testes) → liberação → M1.1, M1.2, M1.3 e M1.4 (dev) → M1.5 (validação).

Tarefa mista: M1.1 a M1.4 compartilham o branch. Não se dividem em PRs separados.

### M2: Imagens acumuladas no histórico (avaliação)

- **M2.1** *(qa)* Verificar se `modalities: {input:["text"]}` no `freellmapi/auto` do `opencode.json` faz o opencode não
  mandar a imagem (servidor local de eco que registra o corpo da requisição), e ler a `#54784` (só leitura) para
  relacionar. Relatório numa issue do fork, sem PR. Atende R17. *(depende de P6)*
- **M2.2** *(backend, condicional)* Só nasce se M2.1 mostrar que a configuração não basta: desenho de correção no
  opencode. Não é publicada antes de M2.1 concluir, e só com autorização do operador. *(depende de P6)*

### U1: Proposta ao upstream (travada)

- **U1.1** *(gestão)* Quando houver resposta do mantenedor na `#60309` E o "vai" do operador: rebasear o branch do épico
  em `upstream/dev`, conferir que só código e testes entraram, abrir o PR upstream seguindo o `CONTRIBUTING.md`.
  Atende R16, R13. *(depende de P9)*

## Testes

### M1

- **T1.1** model real diferente do pedido (`auto` pedido, `nemotron-…` devolvido) → o passo guarda o valor devolvido.
  Cobre R1.
- **T1.2** model real igual ao pedido → o campo é omitido. Cobre R3.
- **T1.3** valor com sequência de escape (`ESC[31m`), controle bidirecional (`U+202E`) e largura zero (`U+200B`) → todo
  caractere de controle e de formatação removido antes de guardar e de exibir. O `ESC` sai e o `[31m` que sobra é texto
  imprimível e fica, como no precedente do zero (ADR-004 do desenho M1.6, confirmado pelo PM em 2026-11-23). Cobre R2.
- **T1.4** `auto` + `U+200B` devolvido → depois de sanitizar é igual ao pedido e o campo é omitido (sanitiza antes de
  comparar). Cobre R2, R3.
- **T1.5** valor gigante (mais de 256 bytes, com caracteres de vários bytes) → no máximo 256 bytes, UTF-8 válido, sem
  caractere partido. Cobre R2.
- **T1.6** provider que não devolve model id, ou devolve vazio → campo ausente, nenhum erro, stream intacto. Cobre R15.
- **T1.7** custo e limites do passo seguem o model pedido mesmo com model real diferente. Cobre R6.
- **T1.8** nenhum header de resposta aparece no evento do passo nem no export. Cobre R7.
- **T1.9** sessão gravada antes do campo carrega e exporta sem erro. Cobre R8. *(depende de P5)*
- **T1.10** TUI mostra `freellmapi/auto → <resolved>` quando difere e não mostra seta quando igual ou ausente, em
  terminal estreito e largo. Cobre R4. *(depende de P4)*
- **T1.11** `opencode session export` contém o campo quando presente e não contém quando ausente. Cobre R5. *(depende de P4)*
- **T1.12** reconstruir o agregado da sessão a partir dos eventos duráveis reproduz o campo. Cobre R1, R10.
- **T1.13** contrato: `bun run generate` em `packages/client` não deixa diferença no git depois do épico, e os testes de
  schema e de identificadores passam. Cobre R9, R10.
- **T1.14** ponta a ponta manual contra o FreeLLMAPI `:3001` com `auto`, usado só como cliente normal (é o roteador de
  produção: sem reiniciar, sem trocar imagem, sem tocar config). O banco do opencode guarda `auto` como pedido e o model
  real como campo próprio; o TUI e o export mostram a diferença. A conferência independente do patch é no `freeapi.db`,
  somente leitura: `requests.platform` e `requests.model_id` (o `served_model` vem vazio). O teste não fixa um nome de
  model, porque o model real muda quando o `fla-pm` trocar a imagem. Cobre R11.

### M2

- **T2.1** com `modalities: {input:["text"]}` e uma imagem no histórico, o corpo da requisição enviado ao servidor de eco
  não contém parte de imagem. Cobre R17.
- **T2.2** sem essa configuração, a imagem é reenviada a cada chamada (reproduz o comportamento da `#54784`). Cobre R17.

## Perguntas

### Respondidas

- **P1** Onde ficam os arquivos de gerência? **Resposta:** no branch `gestao` do fork, nunca mesclado na `dev` nem em
  patches. Operador, no chat, 2026-11-23. Itens revisados: F0.1, `docs/operacao.md`, R13.
- **P2** Como os PRs do Objetivo 1 entram? **Resposta:** um branch de épico a partir de `upstream/dev`, um único PR,
  testes do QA e implementação em commits ordenados (testes primeiro); nada mescla na `dev` do fork. Operador, no chat,
  2026-11-23. Itens revisados: M1 inteiro (tarefa mista), R13, `docs/operacao.md`.
- **P3** Qual executor? **Resposta:** `opencode` no herdr (TUI). Depois, mensagem do mesmo dia: `pi` como fallback; o
  `cursor` talvez, se a franquia semanal de tokens já tiver sido renovada; `agy` é um bom harness "acho" (fica como
  candidato). Operador, no chat, 2026-11-23. Itens revisados: `docs/operacao.md` (`Dev externo:`), M1.1 a M1.4.

- **P8** O FreeLLMAPI `:3001` fica no ar durante M1.5 e M2.1? **Resposta (fato medido pelo Owl, 2026-11-23, que diz que a
  decisão final é do operador):** está no ar (container `freellmapi_freellmapi_1`, healthy, 43 h), e é o roteador de
  PRODUÇÃO de todos os harnesses. Uso permitido: só como cliente normal, sem reiniciar, sem trocar imagem, sem tocar
  config. O `fla-pm` vai trocar a imagem quando os consertos #3, #4 e #5 do fork dele forem validados; a janela da
  validação se combina com ele, e o model real que aparecer pode mudar depois disso. Itens revisados: R11, M1.5, M2.1,
  T1.14 (sem model fixo no teste; conferência no `freeapi.db` somente leitura). O M2.1 não precisa do `:3001`: usa um
  servidor de eco local.

### Em aberto

- **P4** *(prioritária)* O campo aparece só no TUI e no `session export`, ou também nos apps desktop e web
  (`packages/app`, `packages/desktop`)? **Suposição:** só TUI e export, como prometido na `#60309`. Dependem: R4, R5, M1.3,
  M1.4, T1.10, T1.11.
- **P5** Sessões já gravadas ficam sem o campo (não há retroatividade)? **Suposição:** sim, só as novas passam a ter.
  Dependem: R8, M1.1, T1.9.
- **P6** O Objetivo 2 é só avaliação e relatório? **Suposição:** sim; correção no opencode só se M2.1 mostrar que a
  configuração não basta e o operador autorizar. Dependem: R17, M2.1, M2.2.
- **P7** Qual CI vale no fork? O Actions está habilitado e os workflows do upstream rodam nos PRs. **Suposição:** vale o
  que rodar; se falhar por segredo ou infra do runner, registro como indisponível e vale o gate local. Dependem: F0.3,
  ritual de fechamento.
- **P9** Qual o destino do merge da PR do épico no fork? O Owl explicou que o `merge-green` não tem destino especial:
  ele mescla a PR na base que ela já tem (merge-commit, confere CLEAN e head, nunca squash, rebase ou `--auto`), e só
  chama o `gl-mirror` para repos do mapa (o opencode não está nele). Sugestão do Owl, que é como o zero funciona: NÃO
  mesclar na `dev` do fork (ela fica espelho do `upstream/dev`, para o `gh repo sync` continuar limpo); a PR do épico mira
  um branch de integração local do fork, por exemplo `local`, de onde sai o binário de dogfooding, e é mesclada lá com
  `merge-green FabioLeitao/opencode#<n>`. A PR do upstream sai depois do branch do épico, nascido de `upstream/dev`.
  **Suposição adotada (recomendação, aguarda o operador):** a sugestão do Owl. Criar o branch `local` no fork é decisão do
  operador e só acontece com o "ok" dele. Dependem: M1.5, U1.1, ritual de fechamento, `docs/operacao.md`.
