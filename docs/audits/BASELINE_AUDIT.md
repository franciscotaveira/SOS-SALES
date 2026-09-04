# SOS Sales — Baseline técnico

**Data:** 14 de agosto de 2026  
**Estado:** evidência de partida; não é homologação de produção.

## Resultado executivo

O repositório contém dois ativos complementares, mas ainda não um produto
operacional completo:

1. O frontend entrega o cockpit, filas, dossiê, kanban, grupos, resultados e
   configurações como referência de UX forte.
2. O kernel em `apps/api` entrega migrations, isolamento multi-workspace,
   ingestão WAHA inbound, outbox e testes de segurança.

Eles ainda não estão conectados por uma API autenticada. O runtime do frontend
usa `MockSalesOsGateway` e `localStorage`; portanto nenhum indicador, ping,
falha de canal, IA, resultado ou ação exibida pela interface deve ser tratado
como dado real antes das fases de integração.

## Evidências verificadas

| Área | Evidência | Estado |
|---|---|---|
| Frontend | `bun run lint` | aprovado |
| Frontend | `bun run build` | aprovado; bundle principal de 1,115 MB (294 KB gzip) |
| API | `npm --prefix apps/api run build` | aprovado |
| API | `npm --prefix apps/api run check` | 130 testes aprovados |
| Dados | Supabase remoto `yiiuebhyqixzluguxsqi` | vazio; nenhuma migration aplicada |
| Integração | gateway ativo | mock/localStorage |
| WAHA | ambiente local | protegido por chave; QR, sessão e fluxo real não homologados |
| VPS | servidor recriado | sem proxy, firewall, deploy ou runtime publicados |

## P0 antes de qualquer deploy

1. Aplicar e verificar migrations em Supabase de desenvolvimento, com RLS e
   Supabase Auth reais.
2. Criar contrato HTTP único e APIs autenticadas para o cockpit; substituir o
   gateway mock por adapter HTTP.
3. Implementar outbound WAHA com outbox, idempotência, lifecycle e kill switch
   por workspace/canal; depois homologar inbound e outbound em telefone real.
4. Remover do modo de produção todos os controles de simulação, dados fictícios
   e status/pings aleatórios.
5. Criar Docker, CI, reverse proxy/TLS, backup e observabilidade antes de
   publicar no VPS.

## Limites de reutilização do CRM-TX

Podem ser reaproveitados como referência: normalização de identificadores de
chat/LID, timeout, retry, backoff, idempotência e taxonomia de falhas de WAHA.
Não importar credenciais, arquivos de ambiente, modelos Mongoose, controllers
Express legados ou envios síncronos sem outbox.

## Próximo gate

**G1/G2 — contrato e fundação confiáveis:** fixar DTOs e IDs, preparar Supabase
remoto em ambiente de desenvolvimento e conectar autenticação/tenancy antes de
iniciar telas novas ou subir o VPS.
