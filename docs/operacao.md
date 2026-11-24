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
- **Issues e PRs**: só no fork. Todo `gh` de escrita leva `--repo FabioLeitao/opencode`, porque o clone não tem repositório padrão e tem dois remotos.

## Travas do upstream (`anomalyco/opencode`)

- NADA no upstream (issue, comentário, PR, reação) sem o "vai" do operador.
- Referência ao upstream em issue, PR ou commit do fork vai entre crases, sem link, no formato `anomalyco/opencode#60309`: um link gera evento na timeline deles.
- O CONTRIBUTING deles exige revisão de desenho antes de mudança de núcleo. O comentário de desenho já foi postado pelo Owl na `#60309`. O PR upstream só sai depois de resposta do mantenedor e com o "vai".

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
