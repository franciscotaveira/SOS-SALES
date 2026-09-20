-- packages/database/migrations/006_outbound_payload_fingerprint.sql
-- Migration 006: Add payload_fingerprint to outbound_commands with named constraint and schema drift detection

DO $$
DECLARE
    col_type text;
BEGIN
    -- 1. Detecção rigorosa de schema drift
    SELECT data_type INTO col_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'outbound_commands'
      AND column_name = 'payload_fingerprint';

    IF col_type IS NOT NULL THEN
        -- Coluna já existe: validar tipo exato para prevenir encobrir definição incompatível
        IF col_type <> 'text' THEN
            RAISE EXCEPTION 'FATAL_SCHEMA_DRIFT: public.outbound_commands.payload_fingerprint already exists with incompatible type "%", expected "text"', col_type;
        END IF;
    ELSE
        -- Coluna não existe: adicionar como text nullable (compatibilidade com registros legados)
        ALTER TABLE public.outbound_commands
            ADD COLUMN payload_fingerprint text;
    END IF;

    -- 2. Garantir constraint nomeada chk_outbound_payload_fingerprint
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_outbound_payload_fingerprint'
          AND conrelid = 'public.outbound_commands'::regclass
    ) THEN
        ALTER TABLE public.outbound_commands
            ADD CONSTRAINT chk_outbound_payload_fingerprint
            CHECK (payload_fingerprint IS NULL OR payload_fingerprint ~ '^[0-9a-f]{64}$');
    END IF;
END $$;

-- 3. Índice condicional para aceleração de auditorias e verificações de integridade
CREATE INDEX IF NOT EXISTS idx_outbound_commands_fingerprint
    ON public.outbound_commands(workspace_id, payload_fingerprint)
    WHERE payload_fingerprint IS NOT NULL;

-- 4. Reafirmação explícita de Menor Privilégio:
-- sos_app_user possui estritamente SELECT, INSERT em outbound_commands.
-- Zero concessão de UPDATE para sos_app_user.
REVOKE UPDATE, DELETE ON TABLE public.outbound_commands FROM sos_app_user;
