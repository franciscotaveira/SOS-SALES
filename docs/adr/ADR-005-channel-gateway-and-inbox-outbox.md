# ADR-005: Arquitetura de Canais Multi-Engine, Transactional Inbox/Outbox e Blindagem de Ingresso

- **Status**: Aprovado
- **Data**: 18 de setembro de 2026
- **Decisores**: Francisco Taveira Rios (MCT LTDA) & Orchestrator MCT OS v2.0
- **Contexto**: A V2 acumulou acoplamento excessivo com rotas e bibliotecas de WhatsApp (mais de 2.900 linhas), quebrando com frequência em atualizações de schemas de provedores não oficiais e impedindo a conexão com a Meta Cloud API (WABA Oficial). Clientes em produção necessitam de coexistência multi-provedor (WABA e WAHA no caminho crítico, com suporte a Evolution), garantias estritas de não perda de mensagens, idempotência atômica e isolamento zero-trust entre o tráfego público de ingresso e os dados tenant.

---

## Decisões Arquiteturais

1. **Evolução da Porta Canônica (`IChannelGateway`)**:
   - Todo o domínio comercial (conversas, mensagens, qualificação de leads, handoff determinístico e feedback CAPI) depende estritamente da interface canônica `IChannelGateway`.
   - O enum de provedores suportados (`ChannelProviderEnum`) preserva `meta_waba`, `waha`, `evolution`, `meta_messenger` e `meta_instagram`.
   - A camada de aplicação e a porta operam exclusivamente com a referência opaca `CredentialLease`. Credenciais descriptografadas nunca são expostas a rotas, handlers, logs ou contratos da aplicação.

2. **Ingress Resolver sob `FORCE RLS` com Função Blindada**:
   - Webhooks públicos não possuem credenciais de usuário para definir `app.current_workspace_id`.
   - Criação da função SQL restrita `lookup_channel_ingress(p_endpoint_token_hash)` com `SECURITY DEFINER` e `search_path = public, pg_temp`.
   - Pertence a `sos_migration_owner`, com execução revogada de `PUBLIC` e concedida estritamente a `sos_ingress_user`.
   - Retorna estritamente a tupla mínima `(channel_instance_id, workspace_id, provider, is_active)`. O `credential_id` e segredos nunca são retornados ao ingress.
   - O servidor Fastify configura `SET LOCAL app.current_workspace_id = :workspace_id` antes de qualquer consulta ou escrita tenant-scoped.

3. **Verificação Segura de Assinatura (`SignatureVerificationService`)**:
   - O handler de webhook delega a verificação criptográfica ao serviço interno sem acessar segredos brutos. A resolução fica restrita ao endpoint e ao canal já identificados e entrega o material somente ao callback criptográfico durante a verificação.
   - A capacidade é executada por um pool interno dedicado com o papel `sos_signature_verifier`; a rota pública e o papel `sos_ingress_user` não recebem essa credencial nem acesso direto ao pool.
   - `sos_signature_verifier` não possui `SELECT` nas tabelas de credenciais. Ele recebe apenas `EXECUTE` na função `resolve_channel_signing_material(channel_instance_id, endpoint_token_hash)`.
   - A função pertence a `sos_migration_owner`, usa `SECURITY DEFINER` com `search_path` fixo em `pg_catalog, public`, revoga `PUBLIC`, exige correspondência entre canal ativo e hash do endpoint e retorna somente `secret_bytes`, `key_version` e `algorithm`. Tokens de envio, App access tokens e demais campos nunca são retornados.
   - O `DatabaseSigningSecretResolver` entrega `secret_bytes` diretamente ao callback de verificação, não o inclui no resultado, DTO, erro ou log e descarta a referência ao sair do callback. A invocação audita timestamp, canal, versão da chave, resultado e correlation ID, sem o segredo.
   - Para Meta WABA: validação HMAC-SHA256 (`X-Hub-Signature-256`) em tempo constante sobre o `rawBody` não parseado.
   - Para WAHA: validação de token do cabeçalho em tempo constante.
   - A rota recebe resultado tipado: `valid`, `invalid` ou `unavailable`. Assinatura inválida encerra fail-closed com HTTP 401; indisponibilidade interna na resolução/verificação encerra com 5xx e observabilidade, sem classificar falha operacional como ataque do remetente.

4. **Padrão Dual: Transactional Inbox + Transactional Outbox**:
   - **Transactional Inbox (`channel_webhook_inbox`)**:
     - Webhook gravado com criptografia em repouso AES-256-GCM no PostgreSQL antes da emissão da confirmação HTTP 200.
     - Deduplicação atômica via `UNIQUE (channel_instance_id, provider_event_key)`.
     - Suporte a retries com locação (`lease_until`), controle de tentativas e dead-letter queue.
   - **Transactional Outbox (`outbound_commands`)**:
     - Disparos de mensagens gravados de forma atômica na mesma transação da regra de negócio.
     - Worker consome a fila com concorrência segura via `SELECT FOR UPDATE SKIP LOCKED` e recuo exponencial.

5. **Desacoplamento de Contato e Thread Comercial**:
   - `contacts`: Representa a identidade humana do cliente por workspace (`workspace_id + phone_e164`).
   - `commercial_threads`: Representa o contexto específico de atendimento naquela linha telefônica (`workspace_id + channel_instance_id + contact_id`).
   - Permite que o workspace atenda o mesmo cliente em múltiplos canais ou migre de provedor sem perda de histórico.

6. **Log Append-Only de Entrega e Política Monotônica**:
   - Tabela `provider_delivery_events` é estritamente append-only (sem `UPDATE` nem `DELETE`), com payload criptografado.
   - O status consolidado em `messages` avança estritamente na direção monotônica:
     $$\text{QUEUED (0)} \longrightarrow \text{SENT (10)} \longrightarrow \text{DELIVERED (20)} \longrightarrow \text{READ (30)}$$
   - `FAILED` é o estado terminal de uma tentativa de envio no outbox, não uma posição intermediária da régua.

7. **Separação de Papéis no Banco de Dados**:
   - `sos_ingress_user`: Restrito a `lookup_channel_ingress()` e `INSERT` em `channel_webhook_inbox`.
   - `sos_signature_verifier`: Restrito a `EXECUTE` em `resolve_channel_signing_material()` por pool interno não exposto ao handler.
   - `sos_worker_user`: Processa inbox e outbox, manipula mensagens e insere em `provider_delivery_events`.
   - `sos_app_user`: Operação do cockpit comercial com acesso somente leitura a `provider_delivery_events`.

---

## Consequências

### Positivas
- Reduz substancialmente o risco de perda de webhooks e duplicação de mensagens em picos de tráfego, condicionado aos gates de persistência, lease, fencing e reconciliação.
- Reduz a superfície de escalada de privilégios via webhook público sob `FORCE RLS`, condicionada aos testes negativos com roles reais.
- Desacoplamento arquitetural completo entre a lógica de atendimento e os motores de mensageria.

### Negativas / Mitigações
- Exigência de infraestrutura de pools de banco distintos na API Fastify para rotas públicas e autenticadas.
- Necessidade de rotina de expurgo/arquivamento para a tabela `channel_webhook_inbox` após o período de retenção.
