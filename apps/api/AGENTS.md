# TX COMMERCIAL CORE — REGRAS DE CONFINAMENTO E SEGURANÇA

## 🔒 P0 — REGRA DE ISOLAMENTO ABSOLUTO (SANDBOX BOUNDARY)

1. **Raiz do Projeto Exclusiva**:
   - Todo o código, testes, migrações SQL, scripts e documentações do núcleo
     comercial devem residir exclusivamente dentro de:
     `/Users/franciscotaveira.ads/Projetos/SOS-SALES/apps/api/`
   - O repositório **SOS-SALES** é a fonte oficial do produto. A antiga cópia
     `new-sales-os` é somente referência histórica e não deve receber mudanças
     para esta entrega.

2. **Proibição de Vazamento de Arquivos**:
   - É estritamente proibido criar, modificar, mover ou deletar arquivos em
     outros repositórios durante o desenvolvimento deste núcleo.
   - Arquivos de integração do produto podem ser alterados na raiz do
     `SOS-SALES` somente quando a mudança exigir contrato compartilhado,
     documentação ou configuração de deploy.

3. **Isolamento de Dados e Portas**:
   - Todo banco de dados deve utilizar as portas dedicadas configuradas no `supabase/config.toml` (Postgres `54332`, Kong `54331`, Studio `54333`).
   - NUNCA conectar em instâncias de banco ou Redis de outros projetos (`deskcomm-crm`, `war-room`, etc.).

4. **Preservação de Segredos**:
   - Arquivos `.env` e chaves privadas nunca saem do disco local e nunca entram no versionamento do Git.
