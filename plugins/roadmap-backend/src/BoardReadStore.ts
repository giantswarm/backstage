import { createHash } from 'node:crypto';
import {
  DatabaseService,
  resolvePackagePath,
} from '@backstage/backend-plugin-api';
import { Knex } from 'knex';

/** One stored board read: the value pro answered, and when it was read. */
export interface StoredRead<T = unknown> {
  data: T;
  /** Epoch milliseconds of the read. */
  readAt: number;
}

/**
 * The board reads of every person, stored apart per person: every read runs
 * with the person's own GitHub grant and holds that person's view of the
 * board, so nothing here is ever looked up without the person it belongs to.
 * A read is addressed by its kind (`items`, `schema`, …) and a key within
 * that kind, the read's arguments.
 */
export interface BoardReadStore {
  get<T>(
    user: string,
    kind: string,
    key: string,
  ): Promise<StoredRead<T> | undefined>;
  set(user: string, kind: string, key: string, read: StoredRead): Promise<void>;
  /** Every read of one kind of the person's, for a write to patch them. */
  list<T>(
    user: string,
    kind: string,
  ): Promise<Array<{ key: string; read: StoredRead<T> }>>;
  /** Drops one read of the person's, or every read of that kind without a key. */
  delete(user: string, kind: string, key?: string): Promise<void>;
  /** Drops every read made before `readBefore`; answers how many. */
  prune(readBefore: number): Promise<number>;
}

/**
 * Board reads in the backend's process: what one instance alone reads, lost
 * on restart. For tests and for a router created without a database.
 */
export class MemoryBoardReadStore implements BoardReadStore {
  // Reads are kept serialized, as a database keeps them, so a caller that
  // changes what it got back never changes the stored read.
  private readonly reads = new Map<
    string,
    { user: string; kind: string; key: string; data: string; readAt: number }
  >();

  private static id(user: string, kind: string, key: string) {
    return JSON.stringify([user, kind, key]);
  }

  async get<T>(user: string, kind: string, key: string) {
    const row = this.reads.get(MemoryBoardReadStore.id(user, kind, key));
    return row
      ? { data: JSON.parse(row.data) as T, readAt: row.readAt }
      : undefined;
  }

  async set(user: string, kind: string, key: string, read: StoredRead) {
    this.reads.set(MemoryBoardReadStore.id(user, kind, key), {
      user,
      kind,
      key,
      data: JSON.stringify(read.data),
      readAt: read.readAt,
    });
  }

  async list<T>(user: string, kind: string) {
    return [...this.reads.values()]
      .filter(row => row.user === user && row.kind === kind)
      .map(row => ({
        key: row.key,
        read: { data: JSON.parse(row.data) as T, readAt: row.readAt },
      }));
  }

  async delete(user: string, kind: string, key?: string) {
    for (const [id, row] of this.reads) {
      if (
        row.user === user &&
        row.kind === kind &&
        (key === undefined || row.key === key)
      ) {
        this.reads.delete(id);
      }
    }
  }

  async prune(readBefore: number) {
    let pruned = 0;
    for (const [id, row] of this.reads) {
      if (row.readAt < readBefore) {
        this.reads.delete(id);
        pruned++;
      }
    }
    return pruned;
  }
}

const TABLE = 'roadmap_board_reads';

interface BoardReadRow {
  user_ref: string;
  kind: string;
  key_hash: string;
  read_key: string;
  data: string;
  read_at: number | string;
}

const migrationsDir = resolvePackagePath(
  '@giantswarm/backstage-plugin-roadmap-backend',
  'migrations',
);

/**
 * Board reads in the plugin's database: shared by every backend instance
 * and kept across restarts. A read's key is stored hashed in the primary key,
 * since a read's arguments (a keyword search) have no length bound.
 */
export class DatabaseBoardReadStore implements BoardReadStore {
  static async create(
    database: DatabaseService,
  ): Promise<DatabaseBoardReadStore> {
    const client = await database.getClient();
    if (!database.migrations?.skip) {
      await client.migrate.latest({ directory: migrationsDir });
    }
    return new DatabaseBoardReadStore(client);
  }

  private constructor(private readonly db: Knex) {}

  private static hash(key: string) {
    return createHash('sha256').update(key).digest('hex');
  }

  private static toRead<T>(row: BoardReadRow): StoredRead<T> {
    return { data: JSON.parse(row.data) as T, readAt: Number(row.read_at) };
  }

  async get<T>(user: string, kind: string, key: string) {
    const row = await this.db<BoardReadRow>(TABLE)
      .where({
        user_ref: user,
        kind,
        key_hash: DatabaseBoardReadStore.hash(key),
      })
      .first();
    return row ? DatabaseBoardReadStore.toRead<T>(row) : undefined;
  }

  async set(user: string, kind: string, key: string, read: StoredRead) {
    await this.db<BoardReadRow>(TABLE)
      .insert({
        user_ref: user,
        kind,
        key_hash: DatabaseBoardReadStore.hash(key),
        read_key: key,
        data: JSON.stringify(read.data),
        read_at: read.readAt,
      })
      .onConflict(['user_ref', 'kind', 'key_hash'])
      .merge(['data', 'read_at']);
  }

  async list<T>(user: string, kind: string) {
    const rows = await this.db<BoardReadRow>(TABLE).where({
      user_ref: user,
      kind,
    });
    return rows.map(row => ({
      key: row.read_key,
      read: DatabaseBoardReadStore.toRead<T>(row),
    }));
  }

  async delete(user: string, kind: string, key?: string) {
    const query = this.db<BoardReadRow>(TABLE).where({ user_ref: user, kind });
    if (key !== undefined) {
      query.andWhere({ key_hash: DatabaseBoardReadStore.hash(key) });
    }
    await query.delete();
  }

  async prune(readBefore: number) {
    return this.db<BoardReadRow>(TABLE)
      .where('read_at', '<', readBefore)
      .delete();
  }
}
