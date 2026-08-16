# PROMPT PARA GEMINI — Task 9: API Contract (OpenAPI 3.1)

## CONTEXTO
Projeto: SOS Sales (TX Commercial Core)
Branch: `codex/import-latest-zip`
Objetivo: Gerar especificação OpenAPI 3.1 completa das rotas reais (source of truth)

## ABORDAGEM RECOMENDADA
**Não escrever manualmente.** Gerar a partir do código Fastify existente usando `@fastify/swagger` + script de exportação.

## ARQUIVOS A CRIAR

### 1. Script de Geração: `apps/api/scripts/generate-openapi.ts`
```typescript
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/interfaces/http/app.js'; // factory function
import { writeFileSync } from 'fs';

async function generate() {
  const app = await buildApp({ logger: false });
  await app.ready();
  
  const spec = await app.swagger(); // @fastify/swagger já registrado
  
  // Exportar YAML + JSON
  const yaml = require('yaml');
  writeFileSync('./openapi.yaml', yaml.stringify(spec));
  writeFileSync('./openapi.json', JSON.stringify(spec, null, 2));
  
  console.log('✅ OpenAPI spec gerada: openapi.yaml + openapi.json');
  await app.close();
}

generate().catch(console.error);
```

### 2. Registrar Swagger no `apps/api/src/interfaces/http/app.ts` (se não tiver)
```typescript
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';

await app.register(fastifySwagger, {
  openapi: {
    info: {
      title: 'SOS Sales API',
      version: '1.0.0',
      description: 'API do SOS Sales — Commercial Operating System'
    },
    servers: [{ url: '/api/v1', description: 'API v1' }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
      }
    },
    security: [{ bearerAuth: [] }]
  },
  transform: jsonSchemaTransform // se usando @fastify/type-provider-zod
});

await app.register(fastifySwaggerUi, {
  routePrefix: '/docs',
  uiConfig: { docExpansion: 'list', deepLinking: true }
});
```

### 3. Adicionar Schemas Zod nas Rotas (para documentação rica)
Exemplo em `known-fact-operations.ts`:
```typescript
// Adicionar .describe() nos schemas Zod
const bodySchema = z.object({
  key: factKey.describe('Chave do fato no formato namespace.chave (ex: cliente.nome)'),
  value: jsonValue.describe('Valor JSON serializável (max 8KB)'),
  confidence: z.number().min(0).max(1).describe('Confiança 0-1'),
  confirmedByCustomer: z.boolean().describe('Confirmado pelo cliente?'),
  // ...
}).strict();
```

### 4. Documento Final: `docs/API_CONTRACT.md`
```markdown
# SOS Sales API Contract

## Base URL
- Local: `http://localhost:4334/api/v1`
- Produção: `https://sos.mct.com.br/api/v1`

## Autenticação
- Bearer Token (Supabase JWT)
- Header: `Authorization: Bearer <access_token>`

## Endpoints
<!-- Auto-gerado do openapi.yaml -->

## Códigos de Erro
| Código | Significado |
|--------|-------------|
| 401 | Token inválido/ausente |
| 403 | Role insuficiente (owner/operator/viewer) |
| 404 | Recurso não encontrado ou cross-tenant |
| 409 | Idempotency-Key conflit (payload diferente) |
| 422 | Payload inválido (Zod validation) |
| 503 | Dependência indisponível (DB, Redis, WAHA) |

## Idempotência
- Header obrigatório em mutações: `Idempotency-Key: <uuid>`
- Mesmo key + payload diferente = 409 Conflict
- Mesmo key + payload igual = 200 OK (retorna resultado original)

## Rate Limits
- Auth endpoints: 10/min
- Mutations: 60/min
- Reads: 300/min
```

## CRITÉRIO DE ACEITE

1. `npm run generate:openapi` (script npm) → gera `openapi.yaml` + `openapi.json` sem erros
2. `openapi.yaml` válido (swagger-codegen ou redocly lint passa)
3. `/docs` endpoint serve Swagger UI funcional localmente
4. `docs/API_CONTRACT.md` existe com resumo humano + link para spec completa
5. Todos endpoints reais documentados (auth, workspaces, cockpit, handoff, journey, outcome, outbound, traffic-proof, facts)

## COMANDOS

```bash
cd /Users/franciscotaveira.ads/Projetos/SOS-SALES/apps/api
npx tsx scripts/generate-openapi.ts
# Verificar:
cat openapi.yaml | head -50
# Servir UI:
npm run dev  # → http://localhost:4334/docs
```