# AGENTS.md - sponsor-motor

Pointer for AI agents working in this repository.

## Project

- Repository: `https://github.com/LCV-Ideas-Software/sponsor-motor`
- App: Sponsor Motor — Cloudflare Worker for sponsor payments through Mercado Pago Orders API
- Branch: `main`
- License: AGPL-3.0-or-later

## Runtime Shape

The Worker processes sponsor payments through Mercado Pago (Card Payment Brick).
Source lives in `src/`; production deployment is exclusively through GitHub
Actions. Preserve webhook verification, idempotency, 3DS, operator-only refund
and cancellation endpoints, the admin CLI, D1 migrations and Secrets Store
bindings. The independent GitHub Pages site lives in `site/`.

## Mandatory Gates

```powershell
npm run check
npm run biome
npm run format:public:check
npm exec -- wrangler deploy --dry-run --strict
```

## Workspace Policy

The current fleet-native standard supersedes obsolete repository-specific
governance. Prefer official native GitHub capabilities and official supported
third-party tools. New custom governance scripts, generators and controllers
require the operator's explicit prior approval. Never restore `actions.lock`,
its consumers, a merge queue or the retired workflow-regex test suite. npm's
dependency lockfile remains required and is regenerated with npm.

There is one human operator. Do not add mandatory human self-review or depend
on a controller in another repository. Use Ultrabrain for substantive reasoning
and cross-review only when complexity justifies it; send complete raw evidence
and use English internally. Preserve external evidence verbatim.

Prepare changes locally. Before any commit, push or PR, present the complete
change report and obtain the operator's approval. GitHub configuration changes,
including environment removal and required-check rules, require separate prior
approval. Do not run production payment requests or remote D1 migrations as
tests. Do not run local `cargo` or `rustc`, use Codespaces, or change Git signing
configuration. Remove only this execution's preserved, no-longer-needed branches.

CI validates pull requests; Deploy validates and publishes pushes to `main`.
Dependabot groups minor/patch version updates and leaves majors separate;
grouping does not restrict native auto-merge eligibility. The local workflow
arms same-repository Dependabot PRs, subject to GitHub's effective required
checks. CodeQL uses Default setup; Scorecard and Zizmor upload SARIF directly.
Linear Release follows the exact successful production Deploy. Preserve the
native Linear–GitHub and Slack–GitHub integrations. This repository publishes
neither npm packages nor Windows artifacts.

## Registro de trabalho (GitHub Projects, Issues e Discussions)

Ha um unico operador humano, auxiliado por Claude e Codex. O registro duravel
do trabalho e obrigatorio e deve preservar propriedade, prioridade e historico.

Quadro deste repositorio: `https://github.com/orgs/LCV-Ideas-Software/projects/8`
Quadro consolidado da organizacao: `https://github.com/orgs/LCV-Ideas-Software/projects/17`

### Os quatro gatilhos

**G1 — mudanca material.** Atualize o registro canonico existente e os vinculos
GitHub/Linear, incluindo Projects, Issues, Discussions, Teams, Initiatives e
Cycles quando pertinente. Use o rotulo `Codex` no trabalho do Codex. Registre
evidencias, pendencias e limites de escopo; nao altere automaticamente a saude,
prioridade ou o estado dos containers por concluir apenas uma tarefa.

**G2 — achado nao corrigido.** Todo bug, falha, limitacao de plataforma ou comportamento
inesperado que voce encontrar e **nao** resolver na hora vira issue imediatamente, com
reproducao, ambiente, evidencia, o que ja foi tentado e a hipotese de causa. Use o
formulario adequado em `.github/ISSUE_TEMPLATE/`. **Excecao de seguranca**: nenhum caso coberto
pelo reporte privado de `SECURITY.md` — nem a suspeita de um deles — vira issue
publica; siga o canal privado de la.

**G3 — decisao ou aprendizado duravel.** Criterio objetivo: _"isto seria util para quem
enfrentar este problema daqui a tres meses?"_ Se sim, vira Discussion.

- Conhecimento especifico deste repo -> Discussions **deste repositorio** (Q&A ou Ideas).
- Conhecimento transversal a varios repos (politica de release, regra de ruleset, restricao
  de plataforma) -> Discussions **da organizacao**.

**G4 — trabalho nao-trivial.** Abra a issue **antes** do PR e referencie com `Closes #N`.
Isso ativa o fechamento automatico, o campo _Linked pull requests_ e a progressao de Status.
**Excecao de seguranca** (tambem no G4): trabalho que remedia **qualquer caso coberto
pelo reporte privado de `SECURITY.md`** — a lista de la, nao uma mais estreita: suspeita
de vulnerabilidade, vazamento de credencial, exposicao de dado privado, bypass de
autenticacao, problema em fluxo de pagamento, questao de cadeia de suprimentos ou
configuracao incorreta de deploy — nao abre issue publica nem carrega `Closes #N` de
superficie publica. O rastreio segue o canal privado do `SECURITY.md` e o advisory
correspondente; o PR referencia o advisory, sem detalhes de exploracao. Se `SECURITY.md`
mudar de escopo, vale o texto de la.

### Valvula de escape

Bump de dependencia, correcao de typo, lockfile e ajuste de formatacao **dispensam issue**.
O PR basta. Os workflows nativos Auto-add dos Projects #8 e #17 adicionam itens novos
que correspondem aos filtros configurados; itens anteriores a ativacao exigem inclusao manual.

### Campos

Classifique toda issue com **Type** (Task, Bug, Feature, Incident, Security, Maintenance,
Documentation, Spike) e preencha os campos de issue da organizacao **Agent** (quem esta
tocando) e **Origin** (de onde surgiu). Em Bug e Incident preencha tambem **Environment**.
Esses campos sao `ORG_ONLY`: nao aparecem para o publico, mesmo neste repositorio publico.

### Fluxo de Status no quadro

`Triagem` -> `Backlog` -> `Em andamento` -> `Em cross-review` -> `Em PR` -> `Concluido`,
com desvios `Bloqueado` e `Descartado`.

> **Invariante**: as opcoes `Triagem` e `Concluido` estao vinculadas **por ID** a workflows
> internos do GitHub que nao sao editaveis por API. Podem ser renomeadas; **nunca apagadas**.

> **Atualizacao por quadro**: `Status`, `Area` e `Ciclo` sao campos de projeto com IDs
> proprios em cada quadro. Atualize os DOIS quadros — o deste repositorio e o portfolio
> #17 — a cada transicao; ID de opcao de um quadro nunca vale no outro (Discussion org#176).

### Configuracao publica e segredos

Issues, PRs e Discussions deste repositorio sao publicos e permanentes. Tokens, chaves,
credenciais e demais segredos nunca sao versionados. Identificadores nao secretos exigidos
pela configuracao oficial — como o UUID de um binding D1 existente — podem permanecer no
`wrangler.json`; eles identificam recursos, mas nao concedem acesso. Detalhes operacionais
sensíveis continuam no quadro privado ou em `.github-private`.
