import type {
  AuthService,
  LoggerService,
  SchedulerService,
  SchedulerServiceTaskScheduleDefinition,
} from '@backstage/backend-plugin-api';
import type { CatalogService } from '@backstage/plugin-catalog-node';
import type { GithubCredentialsProvider } from '@backstage/integration';
import type { Knex } from 'knex';

const GITHUB_PROJECT_SLUG_ANNOTATION = 'github.com/project-slug';
const GIANTSWARM_PURL_RE = /^pkg:golang\/github\.com\/giantswarm\/([^@/]+)/;

const DEFAULT_SCHEDULE: SchedulerServiceTaskScheduleDefinition = {
  frequency: { cron: '0 2 * * *' },
  timeout: { minutes: 30 },
};

interface SbomApiResponse {
  sbom: {
    packages: Array<{
      name: string;
      externalRefs: Array<{
        referenceCategory: string;
        referenceLocator: string;
        referenceType: string;
      }>;
    }>;
  };
}

export async function createSbomRefreshTask(options: {
  credentialsProvider: GithubCredentialsProvider;
  catalogApi: CatalogService;
  auth: AuthService;
  db: Knex;
  logger: LoggerService;
  scheduler: SchedulerService;
  schedule?: SchedulerServiceTaskScheduleDefinition;
}) {
  const { credentialsProvider, catalogApi, auth, db, logger, scheduler } =
    options;
  const schedule = options.schedule ?? DEFAULT_SCHEDULE;

  await scheduler.scheduleTask({
    id: 'catalog-module-gs:sbom-refresh',
    ...schedule,
    fn: async () => {
      await refreshSbomDependencies({
        credentialsProvider,
        catalogApi,
        auth,
        db,
        logger,
      });
    },
  });
}

export async function refreshSbomDependencies(options: {
  credentialsProvider: GithubCredentialsProvider;
  catalogApi: CatalogService;
  auth: AuthService;
  db: Knex;
  logger: LoggerService;
}) {
  const { credentialsProvider, catalogApi, auth, db, logger } = options;

  const { token } = await auth.getPluginRequestToken({
    onBehalfOf: await auth.getOwnServiceCredentials(),
    targetPluginId: 'catalog',
  });

  const credentials = await auth.authenticate(token);

  let processed = 0;
  let failed = 0;

  // Stream entities in batches and process each immediately to minimize memory usage
  for await (const batch of catalogApi.streamEntities(
    {
      filter: { kind: 'Component' },
      fields: [
        'metadata.name',
        `metadata.annotations.${GITHUB_PROJECT_SLUG_ANNOTATION}`,
      ],
    },
    { credentials },
  )) {
    for (const entity of batch) {
      const slug =
        entity.metadata.annotations?.[GITHUB_PROJECT_SLUG_ANNOTATION];
      if (!slug) {
        continue;
      }

      try {
        const dependencies = await fetchSbomDependencies(
          slug,
          credentialsProvider,
          logger,
        );

        // Filter out self-references
        const repoName = slug.split('/')[1];
        const filtered = dependencies.filter(name => name !== repoName);

        logger.debug(
          `SBOM refresh: ${slug} has ${filtered.length} giantswarm dependencies`,
        );

        // Replace rows for this slug
        await db.transaction(async trx => {
          await trx('sbom_dependencies').where('repo_slug', slug).delete();
          if (filtered.length > 0) {
            await trx('sbom_dependencies').insert(
              filtered.map(name => ({
                repo_slug: slug,
                dependency_name: name,
              })),
            );
          }
        });

        processed++;
      } catch (error) {
        logger.warn(`SBOM refresh: failed to process ${slug}: ${error}`);
        failed++;
      }
    }
  }

  logger.info(
    `SBOM refresh complete: ${processed} processed, ${failed} failed`,
  );
}

const MAX_RETRIES = 3;

function getRetryDelayMs(response: Response): number {
  // GitHub sends x-ratelimit-reset as a Unix epoch timestamp
  const rateLimitReset = response.headers.get('x-ratelimit-reset');
  if (rateLimitReset) {
    const resetMs = parseInt(rateLimitReset, 10) * 1000;
    const delayMs = resetMs - Date.now();
    if (delayMs > 0) {
      return delayMs;
    }
  }

  // Fall back to retry-after header (seconds)
  const retryAfter = response.headers.get('retry-after');
  if (retryAfter) {
    return parseInt(retryAfter, 10) * 1000;
  }

  // Default: 60 seconds
  return 60_000;
}

async function fetchSbomDependencies(
  slug: string,
  credentialsProvider: GithubCredentialsProvider,
  logger: LoggerService,
): Promise<string[]> {
  const repoUrl = `https://github.com/${slug}`;
  const { token } = await credentialsProvider.getCredentials({ url: repoUrl });

  if (!token) {
    throw new Error(`No GitHub credentials for ${repoUrl}`);
  }

  const [owner, repo] = slug.split('/');

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/dependency-graph/sbom`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
    );

    if (
      response.status === 429 ||
      (response.status >= 500 && response.status < 600)
    ) {
      if (attempt < MAX_RETRIES) {
        const delayMs = getRetryDelayMs(response);
        logger.info(
          `SBOM refresh: ${slug} returned ${response.status}, retrying in ${Math.ceil(delayMs / 1000)}s (attempt ${attempt + 1}/${MAX_RETRIES})`,
        );
        await new Promise(resolve => setTimeout(resolve, delayMs));
        continue;
      }
    }

    if (response.status === 404) {
      logger.info(`SBOM refresh: ${slug} has no dependency graph enabled`);
      return [];
    }

    if (!response.ok) {
      throw new Error(
        `GitHub SBOM API returned ${response.status}: ${response.statusText}`,
      );
    }

    const data: SbomApiResponse = await response.json();
    return extractGiantSwarmDependencies(data);
  }

  throw new Error(`GitHub SBOM API failed after ${MAX_RETRIES} retries`);
}

export function extractGiantSwarmDependencies(data: SbomApiResponse): string[] {
  const names = new Set<string>();

  for (const pkg of data.sbom.packages) {
    for (const ref of pkg.externalRefs) {
      if (ref.referenceType !== 'purl') continue;

      const match = ref.referenceLocator.match(GIANTSWARM_PURL_RE);
      if (match) {
        names.add(match[1]);
      }
    }
  }

  return Array.from(names);
}
