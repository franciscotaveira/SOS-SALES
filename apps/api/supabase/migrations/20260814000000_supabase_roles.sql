-- Migration: Ensure standard Supabase roles exist for self-hosted/lab environments
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN 
    CREATE ROLE service_role; 
  END IF; 
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN 
    CREATE ROLE authenticated; 
  END IF; 
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN 
    CREATE ROLE anon; 
  END IF; 
  GRANT ALL PRIVILEGES ON SCHEMA public TO service_role, authenticated, anon; 
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role, authenticated, anon;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role, authenticated, anon;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role, authenticated, anon;
END $$;
