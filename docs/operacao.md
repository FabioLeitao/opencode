# Operação do projeto

Modo: autônomo
Pausa: nenhuma
Duelo: nenhum
Pré-voo: modo=desligado (sem builder)
CI do GitHub: a verificar (F0.3). Enquanto não houver resultado, vale o gate local abaixo.
Dev externo: opencode (TUI no herdr, nunca headless, modelo Auto do FreeLLMAPI primeiro; skill `operar-opencode`). Fallback: pi (skill `operar-pi`). Depois, o cursor, só se o operador confirmar que a franquia semanal de tokens foi renovada, e com a justificativa escrita por tarefa. Candidato, ainda sem confirmação do operador: agy (skill `operar-agy`). Tarefas dele levam o rótulo `dev-externo`.

## Onde cada coisa mora

- **Gerência** (plano, descrição, custos, PDFs, memória do PM): branch `gestao` do fork `FabioLeitao/opencode`. Nunca mescla na `dev`, nunca entra em branch de patch. O `gestao` não tem rastreamento de upstream, e o push é sempre explícito: `git push origin gestao:gestao`.
- **Código**: um branch de épico por objetivo, nascido de `upstream/dev` (nome com no máximo três palavras, sem barra; o do Objetivo 1 é `resolved-model`). Testes do QA e implementação entram nele em commits ordenados, testes primeiro, e saem num único PR. Nada mescla na `dev` do fork.
- **Issues e PRs**: só no fork. Todo `gh` de escrita leva `--repo FabioLeitao/opencode`, mesmo com o padrão já definido.
- **Bloqueios contra PR ou push acidental no upstream** (configuração local do clone, feita em 2026-11-23, a pedido do operador): `gh repo set-default FabioLeitao/opencode` (grava `remote.origin.gh-resolved = base`), de modo que o `gh` sem `--repo` cai no fork; e `git remote set-url --push upstream DISABLED_no_push_to_upstream`, de modo que o `git push` para o remoto `upstream` falha (o fetch continua funcionando). Esses bloqueios não impedem um `gh ... --repo anomalyco/opencode` explícito: esse caso só se evita pela trava de "nada no upstream sem o vai". Para a PR do upstream, quando chegar a hora, a branch do épico sobe pelo `origin` e o `gh pr create --repo anomalyco/opencode --head FabioLeitao:<branch>` é feito só com o "vai". Para desfazer: `git remote set-url --push upstream https://github.com/anomalyco/opencode.git` e `gh repo set-default --unset`.

## Regra inegociável: NUNCA worktree, NUNCA cópia ou clone do repo (ordem do operador, repetida; 24/nov/2026)

Vale para o PM, todo subagente, todo revisor e todo dev externo, de qualquer harness. Proibido `git worktree add`, o `--worktree` e o `-w` de qualquer harness, e copiar ou clonar o repositório para outra pasta (`/tmp`, `~/.cache`, qualquer outra). Todo trabalho vai em BRANCH do clone canônico (`git switch -c`); clone sujo se resolve com commit num branch. O `/tmp` é tmpfs (RAM): temporário só pequeno, por `mktemp`, apagado por quem o criou (`trap`). Antes de apagar um temporário, guardar o trabalho no clone (commit e push) e conferir. **Esta linha entra em todo brief de dev externo e em toda chamada a subagente.** Conferência do PM depois de cada passo: `git worktree list` (só o clone canônico) e o `/tmp`. Fonte: `~/.claude/CLAUDE.md` e `~/AGENTS.md`.

## Travas do upstream (`anomalyco/opencode`)

- NADA no upstream (issue, comentário, PR, reação) sem o "vai" do operador.
- Referência ao upstream em issue, PR ou commit do fork vai entre crases, sem link, no formato `anomalyco/opencode#60309`: um link gera evento na timeline deles.
- O CONTRIBUTING deles exige revisão de desenho antes de mudança de núcleo. O comentário de desenho já foi postado pelo Owl na `#60309`. O PR upstream só sai depois de resposta do mantenedor e com o "vai".

## Brief de dev externo (regras do operador via Owl, 2026-11-23; valem as skills `operar-*` em `~/.agents/skills`)

- **Linha obrigatória em todo brief de dev externo neste fork:** "Do not open, comment on, react to or close anything in anomalyco/opencode (the upstream). Issues and PRs go only to the fork." Nenhum agente nem dev externo mexe no upstream; ao upstream só vai o que foi validado localmente, com o "vai" do operador, uma PR por vez, seguindo o CONTRIBUTING de lá.
- **Modelo por harness.** Passam pelo FreeLLMAPI e começam SEMPRE no Auto: opencode, goose, pi, cline, zero e hermes. Não passam por ele e usam conta e modelo próprios: agy (Google/Gemini fixo), codex (OpenAI), cursor (assinatura, eventual), grok (xAI) e dsh (nunca chave real).
- O evento da tarefa registra qual conta e qual modelo escreveram o patch. No zero, o model real aparece em `zero usage report` (`auto -> <modelo>`).
- Antes de montar o brief, chamar a skill `operar-dev-externo` e a do harness escolhido (o texto antigo, se carregado, vale menos que o atual).

## Gate local (este repo não tem builder)

- `bun install` na raiz, e `bun typecheck` e `bun run test` dentro de cada pacote tocado (os testes não rodam na raiz).
- `bun run check` na raiz como verificação completa de lint e tipos.
- Após mudar o Protocol ou a API do Server: `bun run generate` em `packages/client`, sem editar o cliente gerado.
- Antes de escrever ou mudar testes: ler a skill correspondente em `.opencode/skills` (`unit-tests`, `tui-tests`, `app-e2e-tests`, `component-tests`).
- Sem Changesets. Branch com no máximo três palavras. Commits e título de PR no formato `type(scope): summary`.

## FreeLLMAPI `:3001` (roteador de produção)

É o roteador de PRODUÇÃO de todos os harnesses (container `freellmapi_freellmapi_1`). Na validação, só como cliente normal: sem reiniciar, sem trocar imagem, sem tocar config. O `fla-pm` troca a imagem quando os consertos #3, #4 e #5 do fork dele forem validados: combinar a janela com ele, e o model real observado pode mudar depois. Conferência independente do patch: `freeapi.db`, somente leitura, `requests.platform` e `requests.model_id` (o `served_model` vem vazio). Fonte: Owl, 2026-11-23.

## Ritual de fechamento de épico (`projectAgents#104`)

Três revisões, o gate no SHA exato, CI verde e merge só por `merge-green`. O `merge-green` mescla a PR na base que ela já tem (merge-commit, confere CLEAN e head, nunca squash, rebase ou `--auto`) e só chama o `gl-mirror` para repos do mapa (o opencode não está nele). O destino da PR do épico no fork está em aberto (P9 do plano): a recomendação, vinda do Owl, é um branch de integração `local` (de onde sai o binário de dogfooding), com a `dev` do fork como espelho limpo do `upstream/dev`. Criar o `local` é decisão do operador. Até ele decidir, a PR do épico não mescla na `dev` do fork.

## Proteção da base

Não se aplica: a `dev` do fork espelha o upstream e nenhum PR mescla nela.

## Registro de decisões adiadas

(nenhuma)
