/**
 * LAB ENVIRONMENT GUARD — FAIL-CLOSED PRODUCTION ISOLATION
 *
 * Ensures that development and Lab environments NEVER accidentally connect to
 * or reference production Supabase, PostgreSQL, or remote VPS infrastructure.
 */

const PROHIBITED_PRODUCTION_PATTERNS = [
  'yiiuebhyqixzluguxsqi',
  'vkcusycstkgnitwefrfg',
  'iaparavendas.tech',
  'crm.iaparavendas.tech',
  '179.197.72.221',
  'aws-0-ca-central-1.pooler.supabase.com',
];

export function assertNotProductionTarget(
  targetUrlOrString: string | undefined,
  contextName = 'Unknown target'
): void {
  if (!targetUrlOrString) return;

  const lower = targetUrlOrString.toLowerCase();
  for (const pattern of PROHIBITED_PRODUCTION_PATTERNS) {
    if (lower.includes(pattern)) {
      throw new Error(
        `[FAIL-CLOSED LAB GUARD] Blocked connection/reference to production infrastructure in development/lab! ` +
        `Target: ${contextName}, Matched prohibited pattern: "${pattern}". Aborting.`
      );
    }
  }
}

export function validateLabEnvironmentIsolation(
  env: Record<string, string | undefined> = process.env
): void {
  const isExplicitProductionServer =
    env.NODE_ENV === 'production' && !env.LAB_DATABASE_URL && !env.LAB_SUPABASE_URL;

  if (isExplicitProductionServer) {
    // In real production runtime on VPS, connections to cloud DB are intentional.
    return;
  }

  // In Development, Test, and Docker Lab: strictly verify no production targets exist
  const targetsToCheck = [
    { name: 'DATABASE_URL', value: env.DATABASE_URL },
    { name: 'LAB_DATABASE_URL', value: env.LAB_DATABASE_URL },
    { name: 'SUPABASE_URL', value: env.SUPABASE_URL },
    { name: 'LAB_SUPABASE_URL', value: env.LAB_SUPABASE_URL },
    { name: 'SUPABASE_JWKS_URL', value: env.SUPABASE_JWKS_URL },
    { name: 'LAB_SUPABASE_JWKS_URL', value: env.LAB_SUPABASE_JWKS_URL },
    { name: 'SUPABASE_JWT_ISSUER', value: env.SUPABASE_JWT_ISSUER },
    { name: 'LAB_SUPABASE_JWT_ISSUER', value: env.LAB_SUPABASE_JWT_ISSUER },
    { name: 'VITE_SUPABASE_URL', value: env.VITE_SUPABASE_URL },
  ];

  for (const target of targetsToCheck) {
    assertNotProductionTarget(target.value, target.name);
  }
}
