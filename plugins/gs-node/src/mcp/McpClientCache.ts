import { createHash } from 'crypto';
import { LoggerService } from '@backstage/backend-plugin-api';
import { MCPClient } from '@ai-sdk/mcp';

interface CacheEntry {
  clientPromise: Promise<MCPClient>;
  createdAt: number;
  // Set to false when the underlying MCP transport invokes its `onclose`
  // hook. The cache uses this to evict dead entries on the next access
  // instead of handing the LLM a closed client (which would surface as
  // `MCPClientError: Attempted to send a request from a closed client` on
  // every subsequent tool call until the entry expires).
  alive: boolean;
}

const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes
const DEFAULT_SWEEP_INTERVAL_MS = 60 * 1000; // 60 seconds

// Match @ai-sdk/mcp's `MCPClientError({ message: 'Attempted to send a
// request from a closed client' })` thrown from `request()` when
// `isClosed` is set. The string is stable across versions of the SDK
// since it's part of the public error surface used by docs / blog
// posts; if it ever changes we'd just stop self-healing on this signal,
// not crash.
const CLOSED_CLIENT_ERROR_FRAGMENT =
  'Attempted to send a request from a closed client';

export function isClosedClientError(error: unknown): boolean {
  if (!error) return false;
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message.includes(CLOSED_CLIENT_ERROR_FRAGMENT);
}

export class McpClientCache {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly ttlMs: number;
  private readonly sweepTimer: ReturnType<typeof setInterval>;

  constructor(
    private readonly logger: LoggerService,
    options?: { ttlMs?: number; sweepIntervalMs?: number },
  ) {
    this.ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS;
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
    const existing = this.cache.get(key);
    if (existing) {
      if (existing.alive) {
        return existing.clientPromise;
      }
      // The transport's onclose fired since we last handed this entry
      // out. Evict it so we recreate cleanly below; do NOT await
      // invalidate's client.close() because the underlying transport
      // is already gone.
      this.logger.debug(
        `McpClientCache: cached entry '${key}' is closed; recreating`,
      );
      this.cache.delete(key);
    }

    const entry: CacheEntry = {
      // Filled in below once factory resolves.
      clientPromise: undefined as unknown as Promise<MCPClient>,
      createdAt: Date.now(),
      alive: true,
    };

    entry.clientPromise = factory()
      .then(client => {
        // Chain into the transport's onclose handler so we learn when
        // the connection has been torn down (idle timeout from the
        // server, network drop, server-side reset, ...). The MCPClient
        // installs its own onclose during construction; we wrap it so
        // both run, leaving the SDK's bookkeeping intact.
        try {
          // `transport` is private on MCPClient, but the chain hook is
          // the only practical way to detect closure without polling.
          // Cast through `unknown` to avoid lint complaints; runtime
          // shape is stable across the @ai-sdk/mcp 1.x/2.x line.
          const transport = (
            client as unknown as {
              transport?: { onclose?: (...args: unknown[]) => void };
            }
          ).transport;
          if (transport) {
            const previous = transport.onclose;
            transport.onclose = (...args: unknown[]) => {
              entry.alive = false;
              try {
                previous?.(...args);
              } catch (closeErr) {
                // Don't let chaining surface as an unhandled rejection.
                this.logger.debug(
                  `McpClientCache: chained onclose for '${key}' threw: ${
                    closeErr instanceof Error
                      ? closeErr.message
                      : String(closeErr)
                  }`,
                );
              }
            };
          }
        } catch (hookErr) {
          // If the SDK shape changed and we can't install the hook,
          // continue without close-detection rather than failing the
          // whole request. The 30-minute TTL still bounds staleness.
          this.logger.debug(
            `McpClientCache: failed to install onclose hook for '${key}': ${
              hookErr instanceof Error ? hookErr.message : String(hookErr)
            }`,
          );
        }
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
   * Mark a cached entry dead without awaiting client.close(). Use this
   * from a tool-execution catch block when the SDK reports the client
   * is closed, so the very next chat request creates a fresh client
   * instead of waiting for the TTL to evict the dead entry.
   */
  markDead(key: string): void {
    const entry = this.cache.get(key);
    if (entry) {
      entry.alive = false;
    }
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

  private sweep(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (!entry.alive || now - entry.createdAt > this.ttlMs) {
        this.logger.debug(
          `McpClientCache: evicting ${
            entry.alive ? 'expired' : 'closed'
          } entry '${key}'`,
        );
        this.invalidate(key).catch(() => {});
      }
    }
  }
}
