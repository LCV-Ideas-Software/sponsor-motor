# AGENTS.md - sponsor-motor

Pointer for AI agents working in this repository.

## Project

- Repository: `https://github.com/LCV-Ideas-Software/sponsor-motor`
- App: Sponsor Motor — Cloudflare Worker de pagamentos de patrocinio via Mercado Pago
- Branch: `main`
- License: AGPL-3.0-or-later

## Runtime Shape

Cloudflare Worker que processa pagamentos de patrocinio via Mercado Pago (Card
Payment Brick). Source em `src/`; deploy exclusivamente via GitHub Actions.

## Mandatory Gates

```bash
npm run check
npm run biome
npm run format:public:check
```

## Workspace Policy

Follow the workspace-root `AGENTS.md` directives of the private workspace that
hosts this checkout (not versioned in this public repository). In
particular: no self-review in cross-review gates, `ultrabrain` plus
`cross-review-v2` before substantive closure, `cross-review-v1` only as fallback
for v2, `main` as the deployment branch, and Commit & Sync only after final
audit when requested.

## Registro de trabalho (GitHub Projects, Issues e Discussions)

A equipe e composta por tres membros: o **operador** (humano), **Claude Code** e **ChatGPT-Codex**.
Quase todo trabalho acontece em par (operador+Claude ou operador+Codex). O que fica so no
transcript da sessao se perde para o outro membro. Por isso o registro abaixo e **obrigatorio**.

Quadro deste repositorio: `https://github.com/orgs/LCV-Ideas-Software/projects/8`
Quadro consolidado da organizacao: `https://github.com/orgs/LCV-Ideas-Software/projects/17`

### Os quatro gatilhos

**G1 — fim de bloco de trabalho.** Publique um _status update_ no quadro deste repositorio,
dizendo o que foi feito, o que ficou pendente e o que o proximo agente precisa saber:

```bash
gh api graphql -f query='
  mutation($id:ID!, $body:String!) {
    createProjectV2StatusUpdate(input:{projectId:$id, status:ON_TRACK, body:$body}) {
      statusUpdate { id }
    }
  }' -f id="$PROJECT_ID" -f body="..."
```

Use `AT_RISK` ou `OFF_TRACK` quando for o caso. O `PROJECT_ID` sai de
`gh api graphql -f query='query{organization(login:"LCV-Ideas-Software"){projectV2(number:8){id}}}'`.

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
