import { pathToFileURL } from 'node:url';
import type { RuntimeDependencies } from '../../server.js';

/**
 * The production composition lives outside the repository's local adapters.
 *
 * A deployment supplies a server-only module path through
 * SOS_SALES_RUNTIME_FACTORY. That module may use the platform secret manager,
 * a scoped database identity and a managed Redis identity, but it must return
 * the same explicit ports consumed by the HTTP server. Keeping this boundary
 * explicit prevents the checked-in dev pool and environment-secret fixture
 * from ever becoming an accidental production fallback.
 */
export interface ProductionRuntimeFactory {
  createProductionRuntime: () => Promise<RuntimeDependencies> | RuntimeDependencies;
}

export interface ProductionRuntimeEnvironment {
  SOS_SALES_RUNTIME_FACTORY?: string;
}

export type ProductionRuntimeModuleLoader = (moduleUrl: string) => Promise<unknown>;

function loadModule(moduleUrl: string): Promise<unknown> {
  return import(moduleUrl);
}

function resolveFactoryModule(value: string): string {
  const configuredPath = value.trim();
  if (!configuredPath) {
    throw new Error('Production startup blocked: SOS_SALES_RUNTIME_FACTORY is required.');
  }

  // A local absolute file is intentional: this is a deployment-owned,
  // server-only composition module, never a value controlled by a request or
  // browser. Do not accept package names or remote URLs here.
  if (!configuredPath.startsWith('/')) {
    throw new Error('Production startup blocked: SOS_SALES_RUNTIME_FACTORY must be an absolute file path.');
  }

  return pathToFileURL(configuredPath).href;
}

function isRuntimeFactory(value: unknown): value is ProductionRuntimeFactory {
  return typeof value === 'object'
    && value !== null
    && typeof (value as { createProductionRuntime?: unknown }).createProductionRuntime === 'function';
}

/**
 * Loads only a deployment-owned production composition. This function contains
 * no local Postgres, Redis or raw-secret fallback by design.
 */
export async function createProductionRuntimeFromEnvironment(
  environment: ProductionRuntimeEnvironment = process.env,
  moduleLoader: ProductionRuntimeModuleLoader = loadModule
): Promise<RuntimeDependencies> {
  const moduleUrl = resolveFactoryModule(environment.SOS_SALES_RUNTIME_FACTORY ?? '');

  let module: unknown;
  try {
    module = await moduleLoader(moduleUrl);
  } catch {
    throw new Error('Production startup blocked: configured runtime factory could not be loaded.');
  }

  const candidate = module as { createProductionRuntime?: unknown; default?: unknown };
  const factory = isRuntimeFactory(candidate)
    ? candidate
    : isRuntimeFactory(candidate?.default)
      ? candidate.default
      : null;

  if (!factory) {
    throw new Error('Production startup blocked: configured runtime factory is invalid.');
  }

  let runtime: RuntimeDependencies;
  try {
    runtime = await factory.createProductionRuntime();
  } catch {
    throw new Error('Production startup blocked: configured runtime factory failed.');
  }

  if (!runtime || typeof runtime !== 'object') {
    throw new Error('Production startup blocked: configured runtime factory returned no runtime.');
  }

  return runtime;
}
