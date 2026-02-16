import { createHash } from 'crypto';
import { LoggerService } from '@backstage/backend-plugin-api';
import { MCPClient } from '@ai-sdk/mcp';

interface CacheEntry {
  clientPromise: Promise<MCPClient>;
  createdAt: number;
}

const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes
const DEFAULT_SWEEP_INTERVAL_MS = 60 * 1000; // 60 seconds

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
      return existing.clientPromise;
    }

    const clientPromise = factory().catch(err => {
      // On factory failure, remove the entry so the next request retries
      this.cache.delete(key);
      throw err;
    });

    this.cache.set(key, { clientPromise, createdAt: Date.now() });
    return clientPromise;
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
      if (now - entry.createdAt > this.ttlMs) {
        this.logger.debug(`McpClientCache: evicting expired entry '${key}'`);
        this.invalidate(key).catch(() => {});
      }
    }
  }
}
