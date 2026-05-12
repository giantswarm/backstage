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
import { PROVIDER_NAME, buildPersonalityEntity } from './buildEntity';
import {
  discoverPersonalities,
  type KlausPersonalitySource,
} from './discoverPersonalities';

const DEFAULT_SCHEDULE: SchedulerServiceTaskScheduleDefinition = {
  frequency: { hours: 6 },
  timeout: { minutes: 5 },
  initialDelay: { minutes: 1 },
};

const DEFAULT_SOURCES: KlausPersonalitySource[] = [
  {
    owner: 'giantswarm',
    repo: 'klaus-personalities',
    internal: false,
    ociRegistry: 'gsoci.azurecr.io',
  },
  {
    owner: 'giantswarm',
    repo: 'klaus-personalities-internal',
    internal: true,
    ociRegistry: 'gsociprivate.azurecr.io',
  },
];

export class KlausPersonalitiesProvider implements EntityProvider {
  private connection?: EntityProviderConnection;

  static fromConfig(options: {
    config: RootConfigService;
    logger: LoggerService;
    scheduler: SchedulerService;
  }): KlausPersonalitiesProvider {
    const { config, logger, scheduler } = options;

    const integrations = ScmIntegrations.fromConfig(config);
    const credentialsProvider =
      DefaultGithubCredentialsProvider.fromIntegrations(integrations);

    const scheduleConfig = config.getOptionalConfig(
      'catalog.providers.klausPersonalities.schedule',
    );
    const schedule = scheduleConfig
      ? readSchedulerServiceTaskScheduleDefinitionFromConfig(scheduleConfig)
      : DEFAULT_SCHEDULE;

    return new KlausPersonalitiesProvider({
      sources: DEFAULT_SOURCES,
      credentialsProvider,
      logger,
      scheduler,
      schedule,
    });
  }

  constructor(
    private readonly options: {
      sources: KlausPersonalitySource[];
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
          logger.error(`KlausPersonalitiesProvider refresh failed: ${error}`);
        }
      },
    });
  }

  async refresh(): Promise<void> {
    if (!this.connection) {
      throw new Error('KlausPersonalitiesProvider is not connected');
    }
    const { sources, credentialsProvider, logger } = this.options;

    const discovered = (
      await Promise.all(
        sources.map(source =>
          discoverPersonalities({
            source,
            credentialsProvider,
            logger,
          }).catch(error => {
            logger.warn(
              `KlausPersonalitiesProvider: discovery failed for ${source.owner}/${source.repo}: ${error}`,
            );
            return [];
          }),
        ),
      )
    ).flat();

    const entities: DeferredEntity[] = discovered.map(buildPersonalityEntity);

    logger.info(
      `KlausPersonalitiesProvider: applying ${entities.length} personality entities from ${sources.length} sources`,
    );

    await this.connection.applyMutation({ type: 'full', entities });
  }
}
