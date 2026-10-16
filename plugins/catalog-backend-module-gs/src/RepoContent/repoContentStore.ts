import type { Knex } from 'knex';

const TABLE = 'repo_content';

/**
 * What GitHub reported about a repository's default branch, as fetched.
 * Annotations are derived from it at processing time, so a change to how they
 * are derived takes effect without fetching again.
 */
export type RepoContent = {
  /** Absent for an empty repository, which has no branch yet. */
  defaultBranch?: string;
  hasReadme: boolean;
};

type Row = { content: string };
type SlugRow = Row & { repo_slug: string };

/** The last fetched `RepoContent` per `github.com/project-slug`. */
export class RepoContentStore {
  constructor(private readonly db: Knex) {}

  async get(slug: string): Promise<RepoContent | undefined> {
    const row: Row | undefined = await this.db(TABLE)
      .select('content')
      .where('repo_slug', slug)
      .first();
    return row ? (JSON.parse(row.content) as RepoContent) : undefined;
  }

  /** Every record, keyed by slug. */
  async getAll(): Promise<Map<string, RepoContent>> {
    const rows: SlugRow[] = await this.db(TABLE).select('repo_slug', 'content');
    return new Map(
      rows.map(row => [row.repo_slug, JSON.parse(row.content) as RepoContent]),
    );
  }

  /** Stores `content` for `slug`, and reports whether it differs from before. */
  async put(
    slug: string,
    content: RepoContent,
    fetchedAt: Date,
  ): Promise<boolean> {
    const serialized = JSON.stringify(content);
    const existing: Row | undefined = await this.db(TABLE)
      .select('content')
      .where('repo_slug', slug)
      .first();
    await this.db(TABLE)
      .insert({ repo_slug: slug, content: serialized, fetched_at: fetchedAt })
      .onConflict('repo_slug')
      .merge();
    return existing?.content !== serialized;
  }

  /** Removes the record for `slug`, and reports whether there was one. */
  async delete(slug: string): Promise<boolean> {
    const deleted = await this.db(TABLE).where('repo_slug', slug).delete();
    return deleted > 0;
  }

  /** Removes the records last fetched before `cutoff`. */
  async deleteFetchedBefore(cutoff: Date): Promise<number> {
    return this.db(TABLE).where('fetched_at', '<', cutoff).delete();
  }
}
