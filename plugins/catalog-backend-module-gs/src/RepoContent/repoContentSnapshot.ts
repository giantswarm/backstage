import type { LoggerService } from '@backstage/backend-plugin-api';
import type { RepoContent, RepoContentStore } from './repoContentStore';

const DEFAULT_TTL_MS = 60 * 1000;
const DEFAULT_RETRY_MS = 10 * 1000;

/**
 * The whole `repo_content` table held in memory, so processing a component
 * costs no query. The refresh task runs on one replica only; the others pick
 * its writes up once their copy is older than the TTL.
 *
 * While the table cannot be read, the last records loaded keep being served:
 * passing entities through unchanged would drop the annotations they carry
 * for as long as the outage lasts. The failure is warned about once, not per
 * entity, and the read is retried at most every `retryMs`.
 */
export class RepoContentSnapshot {
  private records?: Map<string, RepoContent>;
  private nextLoadAt = 0;
  private loading?: Promise<Map<string, RepoContent> | undefined>;
  private failing = false;

  constructor(
    private readonly store: RepoContentStore,
    private readonly logger: LoggerService,
    private readonly options: { ttlMs?: number; retryMs?: number } = {},
  ) {}

  /** Makes the next `get` read the table again. */
  invalidate(): void {
    this.nextLoadAt = 0;
  }

  /** The records keyed `owner/repo`, or undefined if none could be read yet. */
  get(): Promise<Map<string, RepoContent> | undefined> {
    if (Date.now() < this.nextLoadAt) {
      return Promise.resolve(this.records);
    }
    this.loading ??= this.load().finally(() => {
      this.loading = undefined;
    });
    return this.loading;
  }

  private async load(): Promise<Map<string, RepoContent> | undefined> {
    try {
      this.records = await this.store.getAll();
      this.nextLoadAt = Date.now() + (this.options.ttlMs ?? DEFAULT_TTL_MS);
      if (this.failing) {
        this.failing = false;
        this.logger.info('RepoContentProcessor: reading the records recovered');
      }
    } catch (error) {
      this.nextLoadAt = Date.now() + (this.options.retryMs ?? DEFAULT_RETRY_MS);
      const meta = { error: String(error) };
      if (this.failing) {
        this.logger.debug(
          'RepoContentProcessor: reading the records failed',
          meta,
        );
      } else {
        this.failing = true;
        this.logger.warn(
          'RepoContentProcessor: reading the records failed',
          meta,
        );
      }
    }
    return this.records;
  }
}
