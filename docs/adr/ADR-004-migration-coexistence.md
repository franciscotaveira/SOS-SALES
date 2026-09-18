# ADR-004: Estratégia de Migração e Coexistência V2/V3 (Strangler Fig)

- **Status**: Aprovado
- **Data**: 18 de setembro de 2026
- **Decisores**: Francisco Taveira Rios (MCT LTDA) & Orchestrator MCT OS v2.0
- **Contexto**: A V2 está em produção atendendo clientes. Uma migração em "big bang" apresenta alto risco de interrupção operacional e perda de dados comerciais. É mandatório permitir coexistência segura e migração progressiva por cliente/workspace.

---

## Decisão

1. **Padrão Strangler Fig com Anti-Corruption Layer (ACL)**:
   - A V3 é implantada em paralelo como um sistema inteiramente independente.
   - Em tempo de execução normal, a V3 **nunca** executa queries diretas no banco de dados da V2.
   - Toda transferência histórica ou migração é realizada por um pipeline de migração assíncrono idempotente:
     ```text
     V2 Read-Only Export → Staging Schema / Parquet → Data Normalizer → Dry-Run Validation → V3 Idempotent Ingestion → Divergence Report
     ```

2. **Isolamento de Ambiente e Portas**:
   - Para evitar conflito em desenvolvimento e testes locais, a V3 utiliza portas dedicadas:
     - **Web V3**: `3400`
     - **API V3**: `4400`
     - **Postgres V3**: `55440` (Volume: `sos_v3_pgdata`)
     - **Redis V3**: `6389` (Volume: `sos_v3_redisdata`)
     - **MinIO V3**: `9008 / 9009` (Volume: `sos_v3_miniodata`)

3. **Migração Progressiva e Cutover por Workspace**:
   - A migração é granular, tenant por tenant.
   - **Workspace Piloto**: Haven será o primeiro cliente migrado após homologação integral no Docker Lab com tráfego sintético.
   - **Fase de Shadow Ingestion**: A V3 recebe cópia dos webhooks (duplicação na borda Caddy/Proxy) em modo passivo para validar normalização sem disparar efeitos colaterais externos (como envios de mensagens ou CAPI).
   - **Cutover Final**:
     1. Congelamento breve de escrita na V2 para o tenant (< 5 minutos).
     2. Delta-sync final.
     3. Apontamento do webhook oficial para a V3.
     4. Conexão das credenciais no V3.
     5. V2 entra em modo estritamente read-only para esse tenant.
     6. Rollback automatizado disponível nas primeiras 72 horas.

---

## Consequências

### Positivas
- Risco operacional reduzido a zero para os demais clientes durante a migração de um workspace.
- Facilidade de reversão em caso de anomalia.
- Código da V3 não herda tabelas depreciadas ou "gambiarras" de retrocompatibilidade da V2.

### Negativas / Mitigações
- Necessidade temporária de manter dois clusters de infraestrutura (V2 e V3) em produção durante a janela de migração. Custos absorvidos temporariamente pela garantia de estabilidade.
