import { readFileSync } from 'node:fs';

const LOCAL_DATABASE_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  'postgres-lab',
  'host.docker.internal',
]);

type DatabaseSslEnvironment = {
  DATABASE_SSL?: string;
  DATABASE_SSL_CA?: string;
  DATABASE_SSL_CA_FILE?: string;
};

type HealthWorker = {
  isHealthy(): boolean;
};

type OptionalHealthWorkers = {
  outbound?: HealthWorker;
  receptionist?: HealthWorker;
};

export function normalizeDatabaseHostname(hostname: string) {
  return hostname.toLowerCase().replace(/^\[(.*)\]$/, '$1');
}

export function resolveDatabaseSslConfig(
  databaseUrl: string,
  env: DatabaseSslEnvironment = process.env,
) {
  let hostname: string;
  try {
    hostname = normalizeDatabaseHostname(new URL(databaseUrl).hostname);
  } catch {
    throw new Error('Production runtime error: DATABASE_URL must be a valid URL.');
  }

  if (LOCAL_DATABASE_HOSTS.has(hostname)) {
    return false;
  }

  const sslCaFile = env.DATABASE_SSL_CA_FILE?.trim();
  const sslCa = env.DATABASE_SSL_CA?.trim()
    || (sslCaFile ? readFileSync(sslCaFile, 'utf8') : undefined);

  if (!sslCa) {
    throw new Error(
      'Production runtime error: DATABASE_SSL_CA or DATABASE_SSL_CA_FILE is required for verified database TLS.',
    );
  }

  return { rejectUnauthorized: true as const, ca: sslCa };
}

export function buildReadinessStatuses(
  worker: HealthWorker,
  workers: OptionalHealthWorkers = {},
) {
  return [
    { name: 'waha-inbound-worker', healthy: worker.isHealthy() },
    ...(workers.outbound
      ? [{ name: 'outbound-worker', healthy: workers.outbound.isHealthy() }]
      : []),
    ...(workers.receptionist
      ? [{ name: 'receptionist-worker', healthy: workers.receptionist.isHealthy() }]
      : []),
  ];
}
