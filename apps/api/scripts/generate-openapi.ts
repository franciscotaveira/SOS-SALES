/**
 * generate-openapi.ts
 * Gera openapi.yaml + openapi.json a partir das rotas reais registradas no Fastify.
 *
 * Uso:
 *   cd apps/api && npx tsx scripts/generate-openapi.ts
 *
 * Saída:
 *   apps/api/openapi.yaml  (spec completa em YAML)
 *   apps/api/openapi.json  (spec completa em JSON)
 */

import { writeFileSync } from 'fs';
import { buildApp } from '../src/interfaces/http/app.js';

// ---------------------------------------------------------------------------
// Stubs mínimos — apenas para que o buildApp inicialize e exponha as rotas.
// Nenhuma dependência real é acessada durante a geração da spec.
// ---------------------------------------------------------------------------
const noop = () => Promise.resolve(undefined as unknown);
const noopGateway = new Proxy({}, { get: () => noop }) as unknown;

const app = buildApp({
  secretProvider: { getSecret: () => Promise.resolve('stub') } as never,
  wahaAdapter: noopGateway as never,
  ingestionGateway: noopGateway as never,
  rateLimit: false,
  logger: false,
});

app.ready().then(async () => {
  // @fastify/swagger expõe .swagger() após ready()
  const spec = (app as unknown as { swagger: () => unknown }).swagger();

  const json = JSON.stringify(spec, null, 2);

  // Gera YAML manualmente (sem dependência externa)
  function toYaml(obj: unknown, indent = 0): string {
    const pad = (n: number) => ' '.repeat(n);
    if (obj === null || obj === undefined) return 'null';
    if (typeof obj === 'boolean') return String(obj);
    if (typeof obj === 'number') return String(obj);
    if (typeof obj === 'string') {
      // Strings com caracteres especiais ficam entre aspas
      if (/[:#\[\]{}&*!|>'"%@`,]/.test(obj) || obj.includes('\n') || obj.trim() !== obj) {
        return `"${obj.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
      }
      return obj;
    }
    if (Array.isArray(obj)) {
      if (obj.length === 0) return '[]';
      return '\n' + obj.map(item => `${pad(indent)}- ${toYaml(item, indent + 2)}`).join('\n');
    }
    if (typeof obj === 'object') {
      const entries = Object.entries(obj as Record<string, unknown>);
      if (entries.length === 0) return '{}';
      return '\n' + entries
        .map(([k, v]) => {
          const val = toYaml(v, indent + 2);
          if (val.startsWith('\n')) {
            return `${pad(indent)}${k}:${val}`;
          }
          return `${pad(indent)}${k}: ${val}`;
        })
        .join('\n');
    }
    return String(obj);
  }

  const yaml = `# SOS Sales API — OpenAPI 3.0.3\n# Auto-gerado por scripts/generate-openapi.ts em ${new Date().toISOString()}\n# NÃO EDITAR MANUALMENTE — regenere com: npm run generate:openapi\n${toYaml(spec).trim()}\n`;

  writeFileSync('./openapi.json', json, 'utf8');
  writeFileSync('./openapi.yaml', yaml, 'utf8');

  console.log('✅ OpenAPI spec gerada:');
  console.log('   → apps/api/openapi.json');
  console.log('   → apps/api/openapi.yaml');

  const specObj = spec as { paths?: Record<string, unknown> };
  const pathCount = Object.keys(specObj.paths ?? {}).length;
  console.log(`   Endpoints documentados: ${pathCount} paths`);

  await app.close();
}).catch((err: Error) => {
  console.error('❌ Falha ao gerar spec:', err.message);
  process.exit(1);
});
