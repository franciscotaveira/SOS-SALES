# TX COMMERCIAL CORE — REGRAS DE CONFINAMENTO E SEGURANÇA

## 🔒 P0 — REGRA DE ISOLAMENTO ABSOLUTO (SANDBOX BOUNDARY)

1. **Raiz do Projeto Exclusiva**:
   - Todo o código, testes, migrações SQL, scripts e documentações do **TX Commercial Core** DEVEM residir EXCLUSIVAMENTE dentro do diretório:
     `/Users/franciscotaveira.ads/Projetos/new-sales-os/`

2. **Proibição de Vazamento de Arquivos**:
   - É ESTRITAMENTE PROIBIDO criar, modificar, mover ou deletar arquivos fora desta pasta durante o desenvolvimento deste núcleo.
   - Não escrever em pastas temporárias globais, `.gemini/`, Desktop ou na raiz de outros repositórios.

3. **Isolamento de Dados e Portas**:
   - Todo banco de dados deve utilizar as portas dedicadas configuradas no `supabase/config.toml` (Postgres `54332`, Kong `54331`, Studio `54333`).
   - NUNCA conectar em instâncias de banco ou Redis de outros projetos (`deskcomm-crm`, `war-room`, etc.).

4. **Preservação de Segredos**:
   - Arquivos `.env` e chaves privadas nunca saem do disco local e nunca entram no versionamento do Git.
