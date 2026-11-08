import { createHash } from 'node:crypto';
import {
  DatabaseService,
  resolvePackagePath,
} from '@backstage/backend-plugin-api';
import { Knex } from 'knex';

/** One stored file read: the content GitHub answered, and when it was read. */
export interface StoredContent {
  content: string;
  /** Epoch milliseconds of the read. */
  readAt: number;
}

/**
 * The file reads of every person, stored apart per person: every read runs
 * with the person's own GitHub grant, so nothing here is ever looked up
 * without the person it belongs to. A read is addressed by a key within the
 * person's reads: the repository, ref and path read.
 */
export interface ContentReadStore {
  get(user: string, key: string): Promise<StoredContent | undefined>;
  set(user: string, key: string, read: StoredContent): Promise<void>;
  /** Drops every read made before `readBefore`; answers how many. */
  prune(readBefore: number): Promise<number>;
}

/**
 * File reads in the backend's process: what one instance alone reads, lost
 * on restart. For tests and for a router created without a database.
 */
export class MemoryContentReadStore implements ContentReadStore {
  private readonly reads = new Map<string, StoredContent>();

  private static id(user: string, key: string) {
    return JSON.stringify([user, key]);
  }

  async get(user: string, key: string) {
    const read = this.reads.get(MemoryContentReadStore.id(user, key));
    return read && { ...read };
  }

  async set(user: string, key: string, read: StoredContent) {
    this.reads.set(MemoryContentReadStore.id(user, key), { ...read });
  }

  async prune(readBefore: number) {
    let pruned = 0;
    for (const [id, read] of this.reads) {
      if (read.readAt < readBefore) {
        this.reads.delete(id);
        pruned++;
      }
    }
    return pruned;
  }
}

const TABLE = 'plans_content_reads';

interface ContentReadRow {
  user_ref: string;
  key_hash: string;
  read_key: string;
  content: string;
  read_at: number | string;
}

const migrationsDir = resolvePackagePath(
  '@giantswarm/backstage-plugin-plans-backend',
  'migrations',
);

/**
 * File reads in the plugin's database: shared by every backend instance and
 * kept across restarts. A read's key is stored hashed in the primary key,
 * since a path has no length bound.
 */
export class DatabaseContentReadStore implements ContentReadStore {
  static async create(
    database: DatabaseService,
  ): Promise<DatabaseContentReadStore> {
    const client = await database.getClient();
    if (!database.migrations?.skip) {
      await client.migrate.latest({ directory: migrationsDir });
    }
    return new DatabaseContentReadStore(client);
  }

  private constructor(private readonly db: Knex) {}

  private static hash(key: string) {
    return createHash('sha256').update(key).digest('hex');
  }

  async get(user: string, key: string) {
    const row = await this.db<ContentReadRow>(TABLE)
      .where({ user_ref: user, key_hash: DatabaseContentReadStore.hash(key) })
      .first();
    return row
      ? { content: row.content, readAt: Number(row.read_at) }
      : undefined;
  }

  async set(user: string, key: string, read: StoredContent) {
    await this.db<ContentReadRow>(TABLE)
      .insert({
        user_ref: user,
        key_hash: DatabaseContentReadStore.hash(key),
        read_key: key,
        content: read.content,
        read_at: read.readAt,
      })
      .onConflict(['user_ref', 'key_hash'])
      .merge(['content', 'read_at']);
  }

  async prune(readBefore: number) {
    return this.db<ContentReadRow>(TABLE)
      .where('read_at', '<', readBefore)
      .delete();
  }
}
