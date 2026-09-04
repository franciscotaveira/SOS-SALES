/**
 * Runtime gates for operations that are intentionally synthetic or destructive.
 *
 * APP_ENV is the deployment-owned environment. NODE_ENV is kept as a second
 * guard because older compose files only set that variable. A production
 * process must never be able to opt into fixture writes through a browser
 * request or an accidentally inherited shell variable.
 */
export function isProductionRuntime(env: Record<string, string | undefined> = process.env): boolean {
  return env.APP_ENV?.trim().toLowerCase() === 'production'
    || env.NODE_ENV?.trim().toLowerCase() === 'production';
}

export function isSyntheticTestDataEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (isProductionRuntime(env)) return false;
  return env.ALLOW_SYNTHETIC_TEST_DATA?.trim().toLowerCase() === 'true';
}
