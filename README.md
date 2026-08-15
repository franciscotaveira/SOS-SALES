<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# SOS Sales

Cockpit comercial para continuidade de vendas no WhatsApp. O repositório contém
dois projetos intencionalmente isolados:

- `./` — frontend React/Vite, gerenciado com Bun;
- `./apps/api` — API Fastify e migrations Supabase, gerenciada com npm.

Não execute `npm install` na raiz: o lockfile da raiz é `bun.lock`. Não execute
`bun install` dentro de `apps/api`: a API possui `package-lock.json` próprio.

## Pré-requisitos

- Node.js 22 LTS e npm 10+;
- Bun 1.3.13+;
- Docker Desktop e Supabase CLI somente para testes de integração/local da API.

## Instalação

```bash
# Frontend (raiz)
bun run web:install

# API (lockfile isolado)
npm run api:install
```

## Qualidade e build

Os gates não misturam configurações TypeScript nem gerenciadores de pacotes.

```bash
# Frontend: typecheck + build Vite
npm run check:web

# API: typecheck/testes Vitest + build tsup
npm run check:api

# Ambos, na ordem acima
npm run check
```

O workflow [CI](.github/workflows/ci.yml) executa os mesmos gates em todo push e
pull request. Os testes da API não iniciam infraestrutura remota no CI; a
homologação com Supabase/Redis/WAHA é um gate separado de ambiente.

## Desenvolvimento local

```bash
# Terminal 1 — frontend
bun run dev

# Terminal 2 — API
cd apps/api && npm run dev
```

Copie somente arquivos de exemplo para variáveis de ambiente. Nunca adicione
tokens, chaves privadas, `.env.local`, dumps de banco ou volumes Docker ao Git.
Os arquivos `.env*` são ignorados, com exceção de arquivos `*.example` sem
segredos.

## Operação autenticada

O cockpit só inicia em modo de API quando as três variáveis abaixo estão presentes:

```bash
VITE_SOS_API_URL=https://api.seudominio.com/api/v1
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-publica
```

O cliente Supabase no navegador usa apenas a chave pública e fornece o JWT da
sessão ao transporte do SOS Sales. Nunca exponha uma `service_role` no frontend.
Sem as três variáveis, builds de produção falham fechados e não exibem fixtures.
Para uma demonstração visual isolada, use somente `VITE_DEMO_MODE=true` fora de
produção; esse modo não se conecta ao Supabase ou à API.
