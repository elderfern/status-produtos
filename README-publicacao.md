# Publicação (caminho pronto "web-cloudflare")

Arquivos instalados pela fábrica com `adlc projeto preparar <nome>`. A pasta `.github/` é protegida
contra agentes pela política do ADLC Hub, e o commit da fábrica recusa mudanças nela: só esse
comando (rodado pelo dono) escreve ali. Faça você o commit desses arquivos.

## O que acontece
- `ci.yml`: em todo push e pull request confere o `wrangler.toml`, roda os testes, a checagem de
  segredos (`scripts/conferir-segredos.mjs`) e o build (`wrangler deploy --dry-run`, wrangler fixado
  instalado fora do repositório). Não usa segredo nenhum.
- `publicar.yml`: só por disparo manual, feito por `adlc intencao publicar|voltar` com o `gh` logado
  na conta do dono. Job `testar` (sem segredo): checkout EXATO do commit aprovado (que precisa estar
  na `main`), testes e build do artefato `dist/`. Job `publicar` (ambiente do GitHub): não roda nada
  do repositório; lê só `wrangler.toml`, `migrations/` e `.github/adlc/`, confere o `wrangler.toml`
  (`.github/adlc/conferir-wrangler.mjs`), aplica as migrações do D1 e publica o artefato. `voltar`
  pula o `testar` e só roda `wrangler rollback`.
- Limitação: `wrangler rollback` volta o código do Worker, **não o D1** (migrações não voltam).

## wrangler.toml aceito
`name = "<projeto>"`, `[env.preview]` com `name = "<projeto>-preview"`, D1 com `binding = "DB"` e
`database_name` `<projeto>` ou `<projeto>-preview`, `migrations_dir = "migrations"`. Recusados:
`[build]`, `route`/`routes`, `account_id`, `[site]`, `workers_dev = false`, tabelas inline e outros
`[env.*]`. O endereço fica em `https://<projeto>.<subdomínio>.workers.dev` (e `-preview`).

## Segredos (nos AMBIENTES do GitHub, digitados por você)
- `CLOUDFLARE_API_TOKEN`: token com o mínimo (*Workers Scripts: Edit*, *D1: Edit*,
  *Account Settings: Read*, sem zonas), só na sua conta.
- `CLOUDFLARE_ACCOUNT_ID`.
Grave em cada ambiente (o `gh` pede o valor; não cole em arquivo nem em conversa):
`gh secret set CLOUDFLARE_API_TOKEN --env producao`, `gh secret set CLOUDFLARE_ACCOUNT_ID --env producao`
e o mesmo com `--env preview`. **Não deixe** os segredos no nível do repositório
(`gh secret delete CLOUDFLARE_API_TOKEN` e `gh secret delete CLOUDFLARE_ACCOUNT_ID`): o job `testar`
roda código de agente e não pode ter acesso a eles.
A fábrica nunca lê nem recebe esses valores.

## Ambientes no GitHub
- `preview`: sem revisor.
- `producao`: Settings › Environments › `producao` › *Required reviewers* com você. É a segunda trava
  humana, fora da fábrica: o job de produção espera o seu clique no GitHub.
