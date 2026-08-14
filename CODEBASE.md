# TX COMMERCIAL CORE — CODEBASE & ARCHITECTURE RECORD

> **Versão:** 1.0.0 (Fase 1: Fundação, Tenancy Hardening & Ingestão)  
> **Kernel:** MCT OS Sovereign Kernel v2.0  
> **Autor:** Francisco Rios | MCT LTDA  
> **Status:** P0.1 validado localmente; P0.2 hardening validado por testes automatizados  

---

## 1. Tese & Domínio
O **TX Commercial Core** (Sales OS) é um Sistema Operacional de Continuidade Comercial e Navegação de Vendas.
Conecta aquisição de tráfego pago (Meta Ads / CTWA) à conversão e fechamento no WhatsApp sem perda de contexto nem quebra de momentum.

### Os 11 Objetos de Domínio
1. **`contacts`** (Fato Mutável): Identidade do cliente em E.164 ou pseudônimo auditado.
2. **`commercial_journeys`** (Entidade Raiz): Ciclo comercial ativo ou encerrado.
3. **`acquisition_contexts`** (Fato Imutável): Origem, campanha, anúncio, UTM, criativo e confiança de atribuição.
4. **`known_facts`** (Fato com Proveniência): Cadastro progressivo com proveniência e nível de confiança.
5. **`decision_events`** (Fato + Inferência): Histórico auditável de transição de estado e raciocínio.
6. **`decision_states`** (Inferência / Projeção): Estágio cognitivo (`DESCONHECIMENTO` ... `POS_VENDA`).
7. **`recommended_actions`** (Hipótese IA): Próxima ação comercial com micro-compromisso e validação de política.
8. **`executed_actions`** (Fato Operacional): Ação disparada com validação transacional e idempotência.
9. **`handoff_cases`** (Dossiê Estruturado): Briefing com 5 tópicos para operador humano.
10. **`commercial_outcomes`** (Fato de Negócio): Fechamento financeiro (`WON`/`LOST`/`UNRESPONSIVE` -> `ABANDONED`) e disparo Meta CAPI.
11. **`compliance_redaction_events`** (Auditoria LGPD): Registro auditável de pseudonimização/redação de PII.

### Tabelas de Infraestrutura Técnica (9 Tabelas)
12. **`workspaces`**: Raiz de isolamento multi-tenant.
13. **`workspace_memberships`**: Vínculo RBAC (`owner`, `operator`, `viewer`) com Last Owner Guard.
14. **`channel_connections`**: Instâncias WhatsApp (WAHA, Meta Cloud, Evolution) com metadados públicos.
15. **`channel_connection_secrets`**: Segregação física de credenciais com acesso restrito a `service_role`.
16. **`inbound_channel_events`**: Envelopes brutos de webhooks com deduplicação e imutabilidade.
17. **`conversation_messages`**: Mensagens de chat normalizadas com FKs compostas e imutabilidade.
18. **`conversation_message_events`**: Ciclo de vida e status de entrega de mensagens (append-only).
19. **`projection_checkpoints`**: Reprocessabilidade e controle de versão de projeções.
20. **`outbox_events`**: Transactional Outbox com `claim_token` fencing, `scheduled_for` e `claim_outbox_batch`.

---

## 2. Infraestrutura & Portas Isoladas
Para evitar colisões com outros projetos da máquina:

| Serviço | Porta no Host | Descrição |
|---|---|---|
| **Kong API Gateway** | `54331` | Supabase API REST & Realtime |
| **PostgreSQL (Supabase DB)** | `54332` | Banco transacional e de eventos |
| **Supabase Studio** | `54333` | Painel web administrativo do banco |
| **Inbucket (Email)** | `54334` | Servidor local de captura de emails |
| **Postgres Shadow DB** | `54330` | Shadow DB para diffs de migração |
| **Redis 7** | `6380` | Filas BullMQ e PubSub |
| **Fastify App** | `3334` | API da aplicação |

---

## 3. Governança de Segurança e Integridade (P0.2 Hardening)
- **Blindagem Cross-Tenant (Composite FKs)**: Todas as tabelas filhas utilizam Foreign Keys compostas `(workspace_id, parent_id)` referenciando `UNIQUE(workspace_id, id)` nas tabelas pai, tornando matematicamente impossível corrupção de dados entre empresas.
- **RBAC Granular Real**:
  - `owner`: Acesso total a membros, canais, configurações e operações.
  - `operator`: Escrita em contatos, jornadas, fatos conhecidos e ações executadas; sem permissão de criar/alterar canais ou membros.
  - `viewer`: Apenas leitura (`SELECT`) em todas as tabelas operacionais.
  - `anon`: Revogação total de privilégios de tabela (princípio do menor privilégio e defesa em profundidade).
  - `service_role`: Acesso total via jobs e workers internos.
- **Funções `SECURITY DEFINER` Blindadas**: `current_user_workspace_ids()` e `user_has_workspace_role()` configuradas com `SET search_path = ''` e nomes de schema totalmente qualificados (`public.*`, `auth.uid()`).
- **Conformidade LGPD**: Procedure `anonymize_contact_pii` usa token aleatório irreversível, deriva o autor da sessão e preserva o histórico não pessoal necessário.
- **Segredos**: O banco armazena apenas referências UUID ao Vault; nenhum segredo ou suposto ciphertext de exemplo é versionado.
- **Outbox Worker Protocol**: Claim, renovação, conclusão e falha passam por RPCs com `claim_token`, `locked_by`, lease, retry e dead-letter.

---

## 4. Comandos de Operação & Testes
```bash
npm run infra:up    # Inicia Supabase DB (54332) + Redis (6380)
npm run db:reset    # Aplica migrations e seed limpo
npm run check       # Executa TypeScript tsc + Suíte completa Vitest
npm test            # Executa a suíte Vitest de integração, segurança e concorrência
```
