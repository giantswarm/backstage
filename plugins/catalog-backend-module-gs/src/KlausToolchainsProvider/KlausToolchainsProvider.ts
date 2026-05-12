import { readSchedulerServiceTaskScheduleDefinitionFromConfig } from '@backstage/backend-plugin-api';
import type {
  LoggerService,
  RootConfigService,
  SchedulerService,
  SchedulerServiceTaskScheduleDefinition,
} from '@backstage/backend-plugin-api';
import {
  DefaultGithubCredentialsProvider,
  ScmIntegrations,
} from '@backstage/integration';
import type { GithubCredentialsProvider } from '@backstage/integration';
import type {
  DeferredEntity,
  EntityProvider,
  EntityProviderConnection,
} from '@backstage/plugin-catalog-node';
import { PROVIDER_NAME, buildToolchainEntity } from './buildEntity';
import {
  discoverToolchains,
  type KlausToolchainSource,
} from './discoverToolchains';

const DEFAULT_SCHEDULE: SchedulerServiceTaskScheduleDefinition = {
  frequency: { hours: 6 },
  timeout: { minutes: 5 },
  initialDelay: { minutes: 1 },
};

const DEFAULT_SOURCES: KlausToolchainSource[] = [
  {
    owner: 'giantswarm',
    repo: 'klaus-toolchains',
    internal: false,
    ociRegistry: 'gsoci.azurecr.io',
  },
  {
    owner: 'giantswarm',
    repo: 'klaus-toolchains-internal',
    internal: true,
    ociRegistry: 'gsociprivate.azurecr.io',
  },
];

export class KlausToolchainsProvider implements EntityProvider {
  private connection?: EntityProviderConnection;

  static fromConfig(options: {
    config: RootConfigService;
    logger: LoggerService;
    scheduler: SchedulerService;
  }): KlausToolchainsProvider {
    const { config, logger, scheduler } = options;

    const integrations = ScmIntegrations.fromConfig(config);
    const credentialsProvider =
      DefaultGithubCredentialsProvider.fromIntegrations(integrations);

    const scheduleConfig = config.getOptionalConfig(
      'catalog.providers.klausToolchains.schedule',
    );
    const schedule = scheduleConfig
      ? readSchedulerServiceTaskScheduleDefinitionFromConfig(scheduleConfig)
      : DEFAULT_SCHEDULE;

    return new KlausToolchainsProvider({
      sources: DEFAULT_SOURCES,
      credentialsProvider,
      logger,
      scheduler,
      schedule,
    });
  }

  constructor(
    private readonly options: {
      sources: KlausToolchainSource[];
      credentialsProvider: GithubCredentialsProvider;
      logger: LoggerService;
      scheduler: SchedulerService;
      schedule: SchedulerServiceTaskScheduleDefinition;
    },
  ) {}

  getProviderName(): string {
    return PROVIDER_NAME;
  }

  async connect(connection: EntityProviderConnection): Promise<void> {
    this.connection = connection;
    const { scheduler, schedule, logger } = this.options;
    await scheduler.scheduleTask({
      id: `${PROVIDER_NAME}:refresh`,
      ...schedule,
      fn: async () => {
        try {
          await this.refresh();
        } catch (error) {
          logger.error(`KlausToolchainsProvider refresh failed: ${error}`);
        }
      },
    });
  }

  async refresh(): Promise<void> {
    if (!this.connection) {
      throw new Error('KlausToolchainsProvider is not connected');
    }
    const { sources, credentialsProvider, logger } = this.options;

    const discovered = (
      await Promise.all(
        sources.map(source =>
          discoverToolchains({
            source,
            credentialsProvider,
            logger,
          }).catch(error => {
            logger.warn(
              `KlausToolchainsProvider: discovery failed for ${source.owner}/${source.repo}: ${error}`,
            );
            return [];
          }),
        ),
      )
    ).flat();

    const entities: DeferredEntity[] = discovered.map(buildToolchainEntity);

    logger.info(
      `KlausToolchainsProvider: applying ${entities.length} toolchain entities from ${sources.length} sources`,
    );

    await this.connection.applyMutation({ type: 'full', entities });
  }
}
