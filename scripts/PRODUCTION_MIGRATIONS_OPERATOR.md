# Produção: aplicação segura de migrations

Uma promoção só prossegue quando dois gates somente-leitura passam:

- `verify-production-schema.mjs` comprova, a partir da estação administrativa,
  que o ledger remoto `supabase_migrations.schema_migrations` contém todas as
  migrations carregadas pela release imutável;
- `verify-production-schema-contract.mjs` confirma no banco as tabelas,
  colunas, índices e funções que o bundle executado usa. Esse segundo gate usa
  `information_schema`/`pg_proc` porque a role da aplicação não deve ler o
  schema interno de migrations.

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
   novamente os dois gates somente-leitura antes de mudar o link `current`.

Não use `db reset`, `drop`, `truncate` nem execute migrations manualmente fora
do fluxo versionado. A aplicação de migrations é uma mudança de banco e requer
aprovação operacional explícita; o gate de promoção é idempotente e não escreve
no banco.
