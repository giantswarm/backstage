import type {
  LoggerService,
  RootConfigService,
  SchedulerService,
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
import { type KlausInstanceConfig, readKlausInstanceConfigs } from './config';
import {
  PROVIDER_NAME,
  buildPersonalityEntity,
} from './buildPersonalityEntity';
import { buildToolchainEntity } from './buildToolchainEntity';
import { buildPluginEntity } from './buildPluginEntity';
import { discoverPersonalities } from './discoverPersonalities';
import { discoverToolchains } from './discoverToolchains';
import { discoverPlugins } from './discoverPlugins';

function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export class KlausProvider implements EntityProvider {
  private connection?: EntityProviderConnection;

  static fromConfig(options: {
    config: RootConfigService;
    logger: LoggerService;
    scheduler: SchedulerService;
  }): KlausProvider[] {
    const { config, logger, scheduler } = options;

    const instances = readKlausInstanceConfigs(config);
    if (instances.length === 0) {
      return [];
    }

    const integrations = ScmIntegrations.fromConfig(config);
    const credentialsProvider =
      DefaultGithubCredentialsProvider.fromIntegrations(integrations);

    return instances.map(
      instance =>
        new KlausProvider({
          instance,
          allInstances: instances,
          credentialsProvider,
          logger,
          scheduler,
        }),
    );
  }

  constructor(
    private readonly options: {
      instance: KlausInstanceConfig;
      allInstances: KlausInstanceConfig[];
      credentialsProvider: GithubCredentialsProvider;
      logger: LoggerService;
      scheduler: SchedulerService;
    },
  ) {}

  getProviderName(): string {
    return `${PROVIDER_NAME}:${this.options.instance.id}`;
  }

  async connect(connection: EntityProviderConnection): Promise<void> {
    this.connection = connection;
    const { scheduler, instance, logger } = this.options;
    await scheduler.scheduleTask({
      id: `${this.getProviderName()}:refresh`,
      ...instance.schedule,
      fn: async () => {
        try {
          await this.refresh();
        } catch (error) {
          logger.error(
            `KlausProvider[${instance.id}] refresh failed: ${error}`,
          );
        }
      },
    });
  }

  async refresh(): Promise<void> {
    if (!this.connection) {
      throw new Error(
        `KlausProvider[${this.options.instance.id}] is not connected`,
      );
    }
    const { instance, allInstances, credentialsProvider, logger } =
      this.options;

    const [personalities, toolchains, plugins] = await Promise.all([
      instance.personalities
        ? discoverPersonalities({
            source: instance.personalities,
            credentialsProvider,
            logger,
          }).catch(error => {
            logger.warn(
              `KlausProvider[${instance.id}]: personalities discovery failed for ${instance.personalities?.owner}/${instance.personalities?.repo}: ${error}`,
            );
            return [];
          })
        : Promise.resolve([]),
      instance.toolchains
        ? discoverToolchains({
            source: instance.toolchains,
            credentialsProvider,
            logger,
          }).catch(error => {
            logger.warn(
              `KlausProvider[${instance.id}]: toolchains discovery failed for ${instance.toolchains?.owner}/${instance.toolchains?.repo}: ${error}`,
            );
            return [];
          })
        : Promise.resolve([]),
      instance.plugins
        ? discoverPlugins({
            source: instance.plugins,
            credentialsProvider,
            logger,
          }).catch(error => {
            logger.warn(
              `KlausProvider[${instance.id}]: plugins discovery failed for ${instance.plugins?.owner}/${instance.plugins?.repo}: ${error}`,
            );
            return [];
          })
        : Promise.resolve([]),
    ]);

    const entities: DeferredEntity[] = [
      ...personalities.map(personality =>
        buildPersonalityEntity({
          personality,
          instance,
          instances: allInstances,
        }),
      ),
      ...toolchains.map(toolchain =>
        buildToolchainEntity({ toolchain, instance }),
      ),
      ...plugins.map(plugin => buildPluginEntity({ plugin, instance })),
    ];

    logger.info(
      `KlausProvider[${instance.id}]: applying ${pluralize(entities.length, 'entity', 'entities')} (${pluralize(personalities.length, 'personality', 'personalities')}, ${pluralize(toolchains.length, 'toolchain', 'toolchains')}, ${pluralize(plugins.length, 'plugin', 'plugins')})`,
    );

    await this.connection.applyMutation({ type: 'full', entities });
  }
}
