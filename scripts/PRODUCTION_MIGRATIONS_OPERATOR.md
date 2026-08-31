# Produção: aplicação segura de migrations

Uma promoção só prossegue quando o `verify-production-schema.mjs` comprova que
o ledger remoto `supabase_migrations.schema_migrations` contém todas as
migrations carregadas pela release imutável.

Quando esse gate informar versões pendentes, um operador autorizado deve:

1. Abrir uma sessão segura no VPS e obter `DATABASE_URL` sem registrá-la no
   histórico do shell, em arquivos de release ou em logs.
2. No diretório da release candidata, executar o fluxo Supabase aprovado:

   ```bash
   cd /opt/sos-sales/releases/<sha>/api
   supabase db push --db-url "$DATABASE_URL"
   ```

   Se o Supabase CLI não estiver instalado no VPS, execute o mesmo comando a
   partir de uma estação administrativa autorizada que tenha acesso ao banco.
3. Rerodar `scripts/promote-production-release.sh <sha>`. A promoção executa
   novamente o gate somente-leitura antes de mudar o link `current`.

Não use `db reset`, `drop`, `truncate` nem execute migrations manualmente fora
do fluxo versionado. A aplicação de migrations é uma mudança de banco e requer
aprovação operacional explícita; o gate de promoção é idempotente e não escreve
no banco.
