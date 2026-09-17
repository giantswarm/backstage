import { createHash } from 'crypto';
import { LoggerService } from '@backstage/backend-plugin-api';
import { MCPClient } from '@ai-sdk/mcp';

interface CacheEntry {
  clientPromise: Promise<MCPClient>;
  // The resolved client, once the factory settled. Lets `markDead` tell the
  // client a caller failed on from a fresh one that has replaced it since.
  client?: MCPClient;
  createdAt: number;
  // Refreshed on every getOrCreate hit. A stateful MCP server (agentgateway's
  // MCP proxy in front of muster) forgets a session that has been idle for
  // its own idle TTL, so an entry nobody used for long is dead on arrival.
  lastUsedAt: number;
  // Set to false when the underlying MCP transport reports it is done with
  // this session: its `onclose` hook (connection torn down), or its
  // `onSessionExpired` hook (the server answered 404 for the session id; the
  // SDK clears the id and, without this, every later request would go out
  // without one). The cache evicts dead entries on the next access instead
  // of handing out a client whose every call would fail until the TTL sweep.
  alive: boolean;
}

const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes
// Well below agentgateway's default MCP session idle TTL (30 minutes), so a
// client is recreated before the gateway has forgotten its session. The retry
// in MusterMcpClient is what makes a lost session harmless; this only spares
// the person the extra round trip.
const DEFAULT_IDLE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const DEFAULT_SWEEP_INTERVAL_MS = 60 * 1000; // 60 seconds

// The hooks the SDK's transports expose for "this session is over". Both are
// public options of the http transport, installed here after construction
// (the same way the SDK itself installs `onclose`) so every factory gets them.
type TransportHook = 'onclose' | 'onSessionExpired';
type HookableTransport = Partial<
  Record<TransportHook, (...args: unknown[]) => void>
>;

export class McpClientCache {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly ttlMs: number;
  private readonly idleTtlMs: number;
  private readonly sweepTimer: ReturnType<typeof setInterval>;

  constructor(
    private readonly logger: LoggerService,
    options?: { ttlMs?: number; idleTtlMs?: number; sweepIntervalMs?: number },
  ) {
    this.ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS;
    this.idleTtlMs = options?.idleTtlMs ?? DEFAULT_IDLE_TTL_MS;
    const sweepIntervalMs =
      options?.sweepIntervalMs ?? DEFAULT_SWEEP_INTERVAL_MS;

    this.sweepTimer = setInterval(() => this.sweep(), sweepIntervalMs);
    this.sweepTimer.unref();
  }

  static buildKey(serverName: string, token?: string): string {
    if (!token) {
      return serverName;
    }
    const hash = createHash('sha256').update(token).digest('hex').slice(0, 12);
    return `${serverName}:${hash}`;
  }

  async getOrCreate(
    key: string,
    factory: () => Promise<MCPClient>,
  ): Promise<MCPClient> {
    const now = Date.now();
    const existing = this.cache.get(key);
    if (existing) {
      const reason = this.staleReason(existing, now);
      if (!reason) {
        existing.lastUsedAt = now;
        return existing.clientPromise;
      }
      // Evict so we recreate cleanly below. A closed entry's transport is
      // already gone, so do NOT await invalidate's client.close() for it;
      // an expired one is closed in the background.
      this.logger.debug(
        `McpClientCache: cached entry '${key}' is ${reason}; recreating`,
      );
      if (reason === 'closed') {
        this.cache.delete(key);
      } else {
        this.invalidate(key).catch(() => {});
      }
    }

    const entry: CacheEntry = {
      // Filled in below once factory resolves.
      clientPromise: undefined as unknown as Promise<MCPClient>,
      createdAt: now,
      lastUsedAt: now,
      alive: true,
    };

    entry.clientPromise = factory()
      .then(client => {
        entry.client = client;
        // Chain into the transport's hooks so we learn when the session is
        // over (idle timeout from the server, network drop, server-side
        // reset, a 404 for the session id, ...). The MCPClient installs its
        // own onclose during construction; we wrap whatever is there so both
        // run, leaving the SDK's bookkeeping intact.
        this.installTransportHooks(key, entry, client);
        return client;
      })
      .catch(err => {
        this.cache.delete(key);
        throw err;
      });

    this.cache.set(key, entry);
    return entry.clientPromise;
  }

  /**
   * Mark a cached entry dead without awaiting client.close(), so the very
   * next getOrCreate creates a fresh client instead of waiting for the TTL
   * sweep. With `client` given, only when the entry still holds that client:
   * a caller that failed on a session another caller has already replaced
   * must not kill the replacement.
   */
  markDead(key: string, client?: MCPClient): void {
    const entry = this.cache.get(key);
    if (!entry) return;
    if (client && entry.client && entry.client !== client) return;
    entry.alive = false;
  }

  async invalidate(key: string): Promise<void> {
    const entry = this.cache.get(key);
    if (!entry) return;

    this.cache.delete(key);
    try {
      const client = await entry.clientPromise;
      await client.close();
    } catch {
      // Client may have already failed; ignore
    }
  }

  async dispose(): Promise<void> {
    clearInterval(this.sweepTimer);
    const keys = [...this.cache.keys()];
    await Promise.all(keys.map(key => this.invalidate(key)));
  }

  private staleReason(
    entry: CacheEntry,
    now: number,
  ): 'closed' | 'expired' | 'idle' | undefined {
    if (!entry.alive) return 'closed';
    if (now - entry.createdAt > this.ttlMs) return 'expired';
    if (now - entry.lastUsedAt > this.idleTtlMs) return 'idle';
    return undefined;
  }

  private installTransportHooks(
    key: string,
    entry: CacheEntry,
    client: MCPClient,
  ): void {
    try {
      // `transport` is private on MCPClient, but the chain hook is the only
      // practical way to detect closure without polling. Cast through
      // `unknown` to avoid lint complaints; runtime shape is stable across
      // the @ai-sdk/mcp 1.x/2.x line.
      const transport = (client as unknown as { transport?: HookableTransport })
        .transport;
      if (!transport) return;
      for (const hook of ['onclose', 'onSessionExpired'] as TransportHook[]) {
        const previous = transport[hook];
        transport[hook] = (...args: unknown[]) => {
          entry.alive = false;
          try {
            previous?.(...args);
          } catch (hookErr) {
            // Don't let chaining surface as an unhandled rejection.
            this.logger.debug(
              `McpClientCache: chained ${hook} for '${key}' threw: ${
                hookErr instanceof Error ? hookErr.message : String(hookErr)
              }`,
            );
          }
        };
      }
    } catch (hookErr) {
      // If the SDK shape changed and we can't install the hooks, continue
      // without close-detection rather than failing the whole request. The
      // TTLs still bound staleness.
      this.logger.debug(
        `McpClientCache: failed to install transport hooks for '${key}': ${
          hookErr instanceof Error ? hookErr.message : String(hookErr)
        }`,
      );
    }
  }

  private sweep(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      const reason = this.staleReason(entry, now);
      if (reason) {
        this.logger.debug(`McpClientCache: evicting ${reason} entry '${key}'`);
        this.invalidate(key).catch(() => {});
      }
    }
  }
}
