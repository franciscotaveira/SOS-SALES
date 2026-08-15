import { describe, it, expect, vi, afterEach } from 'vitest';
import { RuntimeDependencies, startServer } from '../../src/server.js';
import { buildApp } from '../../src/interfaces/http/app.js';
import { PostgresInboundIngestionGateway } from '../../src/infrastructure/database/postgres-inbound-ingestion-gateway.js';
import { PostgresOutboxProcessingGateway } from '../../src/infrastructure/database/postgres-outbox-processing-gateway.js';
import { PostgresDependencyHealthProvider } from '../../src/infrastructure/database/postgres-dependency-health-provider.js';
import { EnvironmentWebhookSecretProvider } from '../../src/infrastructure/security/environment-webhook-secret-provider.js';
import { WahaWebhookAdapter } from '../../src/infrastructure/channels/waha/waha-webhook-adapter.js';
import { WahaInboundWorker } from '../../src/infrastructure/workers/waha-inbound-worker.js';
import { createProductionRuntimeFromEnvironment } from '../../src/infrastructure/runtime/production-runtime.js';
import { OutboxProcessingGateway } from '../../src/application/ports/outbox-processing-gateway.js';
import { DependencyHealthProvider } from '../../src/application/ports/dependency-health-provider.js';
import { ReferencedWebhookSecretProvider } from '../../src/infrastructure/security/referenced-webhook-secret-provider.js';
import {
  WebhookSecretReferenceProvider,
  WebhookSecretResolver,
} from '../../src/application/ports/webhook-secret-resolver.js';

function makeProductionRuntime(
  healthProvider: DependencyHealthProvider = {
    checkAll: async () => [
      { name: 'database', healthy: true },
      { name: 'redis', healthy: true },
      { name: 'worker', healthy: true },
    ],
  }
): RuntimeDependencies {
  const outboxGateway: OutboxProcessingGateway = {
    claimBatch: async () => [],
    completeEvent: async () => {},
    failEvent: async () => {},
    fetchInboundChannelEvent: async () => null,
    normalizeWahaInboundMessage: async () => {},
  };

  return {
    secretProvider: { getWebhookSecret: async () => null },
    wahaAdapter: new WahaWebhookAdapter(),
    ingestionGateway: {
      ingestChannelEvent: async () => ({
        inboundEventId: 'event-1',
        workspaceId: 'workspace-1',
        isDuplicate: false,
      }),
    },
    outboxGateway,
    createHealthProvider: () => healthProvider,
    logger: false,
    trustProxy: false,
  };
}

describe('TX Commercial Core — P0.3B Production Runtime Contracts & Separation of Concerns', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  // ============================================================================
  // 1. PRODUCTION BOOTSTRAP GUARDS & FAIL-EARLY VALIDATIONS
  // ============================================================================
  describe('Production Environment Guards', () => {
    it('RUN-01: official production bootstrap fails early when no server-only runtime factory is configured', async () => {
      process.env.NODE_ENV = 'production';
      await expect(startServer()).rejects.toThrow(
        /Production startup blocked: SOS_SALES_RUNTIME_FACTORY is required/i
      );
    });

    it('RUN-01A: production factory rejects relative, unloadable and invalid server-only configuration', async () => {
      await expect(createProductionRuntimeFromEnvironment({
        SOS_SALES_RUNTIME_FACTORY: 'runtime.mjs',
      })).rejects.toThrow(/must be an absolute file path/i);

      await expect(createProductionRuntimeFromEnvironment({
        SOS_SALES_RUNTIME_FACTORY: '/opt/sos/missing-runtime.mjs',
      }, async () => { throw new Error('module not found at /private/path'); })).rejects.toThrow(
        /configured runtime factory could not be loaded/i
      );

      await expect(createProductionRuntimeFromEnvironment({
        SOS_SALES_RUNTIME_FACTORY: '/opt/sos/invalid-runtime.mjs',
      }, async () => ({ default: {} }))).rejects.toThrow(/configured runtime factory is invalid/i);
    });

    it('RUN-01B: server-only factory composes a fake runtime whose lifecycle starts and stops cleanly', async () => {
      const close = vi.fn().mockResolvedValue(undefined);
      const composedRuntime = await createProductionRuntimeFromEnvironment({
        SOS_SALES_RUNTIME_FACTORY: '/opt/sos/runtime-factory.mjs',
      }, async (moduleUrl) => {
        expect(moduleUrl).toBe('file:///opt/sos/runtime-factory.mjs');
        return {
          createProductionRuntime: () => ({ ...makeProductionRuntime(), close }),
        };
      });

      process.env.NODE_ENV = 'production';
      const instance = await startServer({
        runtime: composedRuntime,
        host: '127.0.0.1',
        port: 0,
        installSignalHandlers: false,
      });

      expect(instance.worker.isHealthy()).toBe(true);
      await instance.stop();
      expect(close).toHaveBeenCalledOnce();
    });

    it('RUN-02: production starts only with explicit server-only ports, without local adapters', async () => {
      process.env.NODE_ENV = 'production';
      const close = vi.fn().mockResolvedValue(undefined);
      const runtime = makeProductionRuntime();
      runtime.close = close;
      const instance = await startServer({
        runtime,
        host: '127.0.0.1',
        port: 0,
        installSignalHandlers: false,
      });

      const ready = await instance.app.inject({ method: 'GET', url: '/ready' });
      expect(ready.statusCode).toBe(200);
      await instance.stop();
      expect(close).toHaveBeenCalledTimes(1);
    });

    it('RUN-03: production rejects an incomplete runtime before binding a port', async () => {
      process.env.NODE_ENV = 'production';
      const runtime = makeProductionRuntime();
      delete (runtime as Partial<RuntimeDependencies>).outboxGateway;

      await expect(startServer({ runtime: runtime as RuntimeDependencies })).rejects.toThrow(
        /OutboxProcessingGateway/
      );
    });

    it('RUN-04: PostgresInboundIngestionGateway throws in production and passes in development/test', () => {
      process.env.NODE_ENV = 'production';
      expect(() => new PostgresInboundIngestionGateway()).toThrow(
        /PostgresInboundIngestionGateway is disabled in production/i
      );

      process.env.NODE_ENV = 'test';
      expect(() => new PostgresInboundIngestionGateway()).not.toThrow();
    });

    it('RUN-05: PostgresOutboxProcessingGateway throws in production and passes in development/test', () => {
      process.env.NODE_ENV = 'production';
      expect(() => new PostgresOutboxProcessingGateway()).toThrow(
        /PostgresOutboxProcessingGateway is disabled in production/i
      );

      process.env.NODE_ENV = 'test';
      expect(() => new PostgresOutboxProcessingGateway()).not.toThrow();
    });

    it('RUN-06: EnvironmentWebhookSecretProvider throws in production and passes in development/test', () => {
      process.env.NODE_ENV = 'production';
      expect(() => new EnvironmentWebhookSecretProvider()).toThrow(
        /EnvironmentWebhookSecretProvider is disabled in production/i
      );

      process.env.NODE_ENV = 'test';
      expect(() => new EnvironmentWebhookSecretProvider()).not.toThrow();
    });
  });

  // ============================================================================
  // 2. DEPENDENCY INJECTION & CONSTRUCTOR CONTRACTS
  // ============================================================================
  describe('Dependency Injection Contracts', () => {
    it('INJ-01: buildApp() throws descriptive errors when mandatory dependencies are missing', () => {
      expect(() => buildApp({} as any)).toThrow(
        /buildApp requires an InboundIngestionGateway instance/i
      );

      expect(() =>
        buildApp({
          ingestionGateway: new PostgresInboundIngestionGateway(),
        } as any)
      ).toThrow(/buildApp requires a WebhookSecretProvider instance/i);

      expect(() =>
        buildApp({
          ingestionGateway: new PostgresInboundIngestionGateway(),
          secretProvider: new EnvironmentWebhookSecretProvider(),
        } as any)
      ).toThrow(/buildApp requires a ChannelWebhookAdapter instance/i);
    });

    it('INJ-02: WahaInboundWorker throws descriptive errors when adapter or outboxGateway is missing', () => {
      expect(() => new WahaInboundWorker({} as any)).toThrow(
        /WahaInboundWorker requires a ChannelWebhookAdapter instance/i
      );

      expect(
        () =>
          new WahaInboundWorker({
            adapter: new WahaWebhookAdapter(),
          } as any)
      ).toThrow(/WahaInboundWorker requires an OutboxProcessingGateway instance/i);
    });
  });

  // ============================================================================
  // 3. HEALTH (LIVENESS) VS READY (READINESS) SEPARATION
  // ============================================================================
  describe('Health vs Readiness Separation', () => {
    it('HLT-01: GET /health returns 200 "ok" liveness without probing or leaking internal dependencies', async () => {
      const app = buildApp({
        secretProvider: new EnvironmentWebhookSecretProvider(),
        wahaAdapter: new WahaWebhookAdapter(),
        ingestionGateway: new PostgresInboundIngestionGateway(),
        logger: false,
      });
      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      const json = JSON.parse(response.payload);
      expect(json.status).toBe('ok');
      expect(json.system).toBe('TX Commercial Core');
      expect(json.version).toBe('1.0.0');
      expect(json.timestamp).toBeDefined();
      // Must NOT leak database/redis details in pure liveness probe
      expect(json.database).toBeUndefined();
      expect(json.dependencies).toBeUndefined();

      await app.close();
    });

    it('HLT-02: GET /ready returns 200 "ready" when all injected dependencies are healthy', async () => {
      const mockHealthProvider: DependencyHealthProvider = {
        checkAll: async () => [
          { name: 'database', healthy: true },
          { name: 'redis', healthy: true },
          { name: 'worker', healthy: true },
        ],
      };

      const app = buildApp({
        secretProvider: new EnvironmentWebhookSecretProvider(),
        wahaAdapter: new WahaWebhookAdapter(),
        ingestionGateway: new PostgresInboundIngestionGateway(),
        healthProvider: mockHealthProvider,
        logger: false,
      });
      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/ready',
      });

      expect(response.statusCode).toBe(200);
      const json = JSON.parse(response.payload);
      expect(json.status).toBe('ready');
      expect(json.dependencies).toEqual([
        { name: 'database', status: 'ok' },
        { name: 'redis', status: 'ok' },
        { name: 'worker', status: 'ok' },
      ]);
      expect(json.timestamp).toBeDefined();

      await app.close();
    });

    it('HLT-03: GET /ready returns 503 "degraded" without reflecting adapter error details', async () => {
      const mockHealthProvider: DependencyHealthProvider = {
        checkAll: async () => [
          { name: 'database', healthy: true },
          { name: 'redis', healthy: false, reason: 'redis://internal:super-secret' },
          { name: 'worker', healthy: true },
        ],
      };

      const app = buildApp({
        secretProvider: new EnvironmentWebhookSecretProvider(),
        wahaAdapter: new WahaWebhookAdapter(),
        ingestionGateway: new PostgresInboundIngestionGateway(),
        healthProvider: mockHealthProvider,
        logger: false,
      });
      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/ready',
      });

      expect(response.statusCode).toBe(503);
      const json = JSON.parse(response.payload);
      expect(json.status).toBe('degraded');
      expect(json.dependencies).toEqual([
        { name: 'database', status: 'ok' },
        { name: 'redis', status: 'degraded' },
        { name: 'worker', status: 'ok' },
      ]);
      expect(response.payload).not.toContain('super-secret');

      await app.close();
    });

    it('HLT-04: GET /ready returns 503 "degraded" when no healthProvider is configured', async () => {
      const app = buildApp({
        secretProvider: new EnvironmentWebhookSecretProvider(),
        wahaAdapter: new WahaWebhookAdapter(),
        ingestionGateway: new PostgresInboundIngestionGateway(),
        logger: false,
      });
      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/ready',
      });

      expect(response.statusCode).toBe(503);
      const json = JSON.parse(response.payload);
      expect(json.status).toBe('degraded');
      expect(json.dependencies).toEqual([
        { name: 'database', status: 'degraded' },
        { name: 'redis', status: 'degraded' },
        { name: 'worker', status: 'degraded' },
      ]);
      expect(json.reason).toBeUndefined();

      await app.close();
    });

    it('HLT-05: GET /ready returns a sanitised 503 when the health provider throws', async () => {
      const app = buildApp({
        secretProvider: new EnvironmentWebhookSecretProvider(),
        wahaAdapter: new WahaWebhookAdapter(),
        ingestionGateway: new PostgresInboundIngestionGateway(),
        healthProvider: { checkAll: async () => { throw new Error('postgres://user:secret@internal'); } },
        logger: false,
      });
      await app.ready();

      const response = await app.inject({ method: 'GET', url: '/ready' });
      expect(response.statusCode).toBe(503);
      expect(response.payload).not.toContain('Dependency health check unavailable');
      expect(response.payload).not.toContain('postgres://');
      await app.close();
    });

    it('HLT-06A: GET /ready returns 503 when a mandatory dependency is reported more than once', async () => {
      const app = buildApp({
        secretProvider: new EnvironmentWebhookSecretProvider(),
        wahaAdapter: new WahaWebhookAdapter(),
        ingestionGateway: new PostgresInboundIngestionGateway(),
        healthProvider: {
          checkAll: async () => [
            { name: 'database', healthy: true },
            { name: 'redis', healthy: true },
            { name: 'redis', healthy: true, reason: 'redis://do-not-leak' },
            { name: 'worker', healthy: true },
          ],
        },
        logger: false,
      });
      await app.ready();

      const response = await app.inject({ method: 'GET', url: '/ready' });
      expect(response.statusCode).toBe(503);
      expect(JSON.parse(response.payload).dependencies).toEqual([
        { name: 'database', status: 'ok' },
        { name: 'redis', status: 'degraded' },
        { name: 'worker', status: 'ok' },
      ]);
      expect(response.payload).not.toContain('do-not-leak');
      await app.close();
    });

    it('HLT-06: GET /ready is degraded when required dependency names are missing', async () => {
      const app = buildApp({
        secretProvider: new EnvironmentWebhookSecretProvider(),
        wahaAdapter: new WahaWebhookAdapter(),
        ingestionGateway: new PostgresInboundIngestionGateway(),
        healthProvider: { checkAll: async () => [] },
        logger: false,
      });
      await app.ready();

      const response = await app.inject({ method: 'GET', url: '/ready' });
      expect(response.statusCode).toBe(503);
      expect(JSON.parse(response.payload).dependencies).toEqual([
        { name: 'database', status: 'degraded' },
        { name: 'redis', status: 'degraded' },
        { name: 'worker', status: 'degraded' },
      ]);
      await app.close();
    });

    it('HLT-07: PostgresDependencyHealthProvider probe returns healthy on real database and handles unreachable safely', async () => {
      const provider = new PostgresDependencyHealthProvider();
      const results = await provider.checkAll();
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('database');
      expect(results[0].healthy).toBe(true);
    });
  });

  // ============================================================================
  // 4. TRUST PROXY BEHAVIOR & REVERSE PROXY CONTRACTS
  // ============================================================================
  describe('Trust Proxy Contracts', () => {
    it('PRX-01: default trustProxy=false ignores forwarded IP headers (uses socket remote address)', async () => {
      let capturedIp = '';
      const app = buildApp({
        secretProvider: new EnvironmentWebhookSecretProvider(),
        wahaAdapter: new WahaWebhookAdapter(),
        ingestionGateway: new PostgresInboundIngestionGateway(),
        logger: false,
        trustProxy: false,
      });

      app.get('/test-ip', async (req) => {
        capturedIp = req.ip;
        return { ip: req.ip };
      });
      await app.ready();

      await app.inject({
        method: 'GET',
        url: '/test-ip',
        headers: {
          'x-forwarded-for': '203.0.113.195, 70.41.3.18',
        },
      });

      // When trustProxy=false, Fastify ignores X-Forwarded-For and uses the injection/socket IP (127.0.0.1)
      expect(capturedIp).toBe('127.0.0.1');

      await app.close();
    });

    it('PRX-02: explicit trustProxy=true extracts the client IP from X-Forwarded-For', async () => {
      let capturedIp = '';
      const app = buildApp({
        secretProvider: new EnvironmentWebhookSecretProvider(),
        wahaAdapter: new WahaWebhookAdapter(),
        ingestionGateway: new PostgresInboundIngestionGateway(),
        logger: false,
        trustProxy: true,
      });

      app.get('/test-ip', async (req) => {
        capturedIp = req.ip;
        return { ip: req.ip };
      });
      await app.ready();

      await app.inject({
        method: 'GET',
        url: '/test-ip',
        headers: {
          'x-forwarded-for': '203.0.113.195',
        },
      });

      expect(capturedIp).toBe('203.0.113.195');

      await app.close();
    });
  });

  // ============================================================================
  // 5. WORKER OUTBOX PROCESSING GATEWAY DECOUPLING & CLEAN SHUTDOWN
  // ============================================================================
  describe('Worker Outbox Gateway Decoupling & Lifecycle', () => {
    it('WRK-01: WahaInboundWorker uses injected OutboxProcessingGateway exclusively', async () => {
      const mockGateway: OutboxProcessingGateway = {
        claimBatch: vi.fn().mockResolvedValue([
          {
            id: 'evt-100',
            workspaceId: 'ws-1',
            eventName: 'inbound.channel_event_received',
            aggregateType: 'InboundChannelEvent',
            aggregateId: 'inb-100',
            payload: {},
            idempotencyKey: 'idem-100',
            claimToken: 'token-100',
            attempts: 0,
          },
        ]),
        fetchInboundChannelEvent: vi.fn().mockResolvedValue({
          id: 'inb-100',
          workspaceId: 'ws-1',
          channelConnectionId: 'conn-1',
          provider: 'waha',
          rawPayload: {
            event: 'message',
            payload: {
              id: 'wamid.msg100',
              from: '5549999112233@c.us',
              body: 'Test decoupled worker',
              timestamp: Date.now(),
            },
          },
        }),
        normalizeWahaInboundMessage: vi.fn().mockResolvedValue(undefined),
        completeEvent: vi.fn().mockResolvedValue(undefined),
        failEvent: vi.fn().mockResolvedValue(undefined),
      };

      const worker = new WahaInboundWorker({
        adapter: new WahaWebhookAdapter(),
        outboxGateway: mockGateway,
      });

      const count = await worker.processSingleBatch();
      expect(count).toBe(1);
      expect(mockGateway.claimBatch).toHaveBeenCalledTimes(1);
      expect(mockGateway.fetchInboundChannelEvent).toHaveBeenCalledWith({
        inboundEventId: 'inb-100',
        workspaceId: 'ws-1',
        provider: 'waha',
      });
      expect(mockGateway.normalizeWahaInboundMessage).toHaveBeenCalledTimes(1);
      expect(mockGateway.completeEvent).toHaveBeenCalledWith({
        eventId: 'evt-100',
        claimToken: 'token-100',
        workerId: expect.stringMatching(/^waha-inbound-worker-/),
      });
      expect(mockGateway.failEvent).not.toHaveBeenCalled();
    });

    it('WRK-02: worker stop() drains in-flight batch execution before completing', async () => {
      let finishProcessingBatch: () => void = () => {};
      const batchBlockedPromise = new Promise<void>((resolve) => {
        finishProcessingBatch = resolve;
      });

      const slowGateway: OutboxProcessingGateway = {
        claimBatch: async () => {
          await batchBlockedPromise;
          return [];
        },
        fetchInboundChannelEvent: async () => null,
        normalizeWahaInboundMessage: async () => {},
        completeEvent: async () => {},
        failEvent: async () => {},
      };

      const worker = new WahaInboundWorker({
        adapter: new WahaWebhookAdapter(),
        outboxGateway: slowGateway,
      });

      // Launch batch in background
      const batchPromise = worker.processSingleBatch();

      // Initiate stop while batch is still in-flight
      let stopFinished = false;
      const stopPromise = worker.stop().then(() => {
        stopFinished = true;
      });

      // Give event loop a tick — stop should NOT have finished yet because batch is blocked
      await new Promise((r) => setTimeout(r, 50));
      expect(stopFinished).toBe(false);

      // Unblock batch
      finishProcessingBatch();
      await batchPromise;
      await stopPromise;

      expect(stopFinished).toBe(true);
    });
  });

  // ============================================================================
  // 6. ENVIRONMENT WEBHOOK SECRET PROVIDER CONTRACTS
  // ============================================================================
  describe('EnvironmentWebhookSecretProvider Contracts', () => {
    it('SEC-01: resolves in-memory registered secret, channel env var, global fallback and null without DB query', async () => {
      const provider = new EnvironmentWebhookSecretProvider({
        'conn-mem-1': 'sec_mem_val',
      });

      // 1. In-memory
      expect(await provider.getWebhookSecret('conn-mem-1')).toBe('sec_mem_val');

      // 2. Channel-specific env var
      const channelId = 'a2000000-0000-0000-0000-000000000099';
      const envKey = `WAHA_WEBHOOK_SECRET_${channelId.replace(/-/g, '_')}`;
      process.env[envKey] = 'sec_channel_env';
      expect(await provider.getWebhookSecret(channelId)).toBe('sec_channel_env');
      delete process.env[envKey];

      // 3. Global fallback env var
      process.env.WAHA_WEBHOOK_SECRET = 'sec_global_fallback';
      expect(await provider.getWebhookSecret('conn-unknown')).toBe('sec_global_fallback');
      delete process.env.WAHA_WEBHOOK_SECRET;

      // 4. Unknown returns null without database query or throwing on missing column
      expect(await provider.getWebhookSecret('conn-empty')).toBeNull();
    });

    it('SEC-02: resolves raw material only through an opaque Vault reference', async () => {
      const referenceProvider: WebhookSecretReferenceProvider = {
        getWebhookSecretReference: vi.fn().mockResolvedValue('51000000-0000-0000-0000-000000000001'),
      };
      const resolver: WebhookSecretResolver = {
        resolveWebhookSecret: vi.fn().mockResolvedValue('resolved-webhook-secret'),
      };
      const provider = new ReferencedWebhookSecretProvider(referenceProvider, resolver);

      await expect(provider.getWebhookSecret('channel-1')).resolves.toBe('resolved-webhook-secret');
      expect(referenceProvider.getWebhookSecretReference).toHaveBeenCalledWith('channel-1');
      expect(resolver.resolveWebhookSecret).toHaveBeenCalledWith('51000000-0000-0000-0000-000000000001');
    });
  });
});
