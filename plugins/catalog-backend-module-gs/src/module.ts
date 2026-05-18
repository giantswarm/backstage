import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';
import {
  catalogProcessingExtensionPoint,
  catalogServiceRef,
} from '@backstage/plugin-catalog-node';
import { containerRegistryServiceRef } from '@giantswarm/backstage-plugin-gs-node';
import { GiantSwarmLocationProcessor } from './GiantSwarmLocationProcessor';
import { KlausProvider } from './KlausProvider';
import { LatestOciReleaseProcessor } from './LatestOciReleaseProcessor';
import { LatestReleaseProcessor } from './LatestReleaseProcessor';
import { PagerDutyAnnotationProcessor } from './PagerDutyAnnotationProcessor';
import { SbomDependencyProcessor } from './SbomDependencyProcessor';

export const catalogModuleGS = createBackendModule({
  pluginId: 'catalog',
  moduleId: 'gs',
  register(reg) {
    reg.registerInit({
      deps: {
        catalog: catalogProcessingExtensionPoint,
        catalogApi: catalogServiceRef,
        urlReader: coreServices.urlReader,
        config: coreServices.rootConfig,
        database: coreServices.database,
        logger: coreServices.logger,
        scheduler: coreServices.scheduler,
        auth: coreServices.auth,
        containerRegistry: containerRegistryServiceRef,
      },
      async init({
        catalog,
        catalogApi,
        urlReader,
        config,
        database,
        logger,
        scheduler,
        auth,
        containerRegistry,
      }) {
        catalog.addProcessor(new GiantSwarmLocationProcessor(urlReader));

        const sbomEnabled = config.getOptionalBoolean(
          'catalog.processors.sbomDependencies.enabled',
        );
        if (sbomEnabled) {
          catalog.addProcessor(
            await SbomDependencyProcessor.create({
              config,
              database,
              logger,
              catalogApi,
              scheduler,
              auth,
            }),
          );
        }

        const pdEnabled = config.getOptionalBoolean(
          'catalog.processors.pagerDutyAnnotations.enabled',
        );
        if (pdEnabled) {
          const pdProcessor = PagerDutyAnnotationProcessor.fromConfig({
            config,
            logger,
          });
          if (pdProcessor) {
            catalog.addProcessor(pdProcessor);
          }
        }

        const latestReleaseEnabled = config.getOptionalBoolean(
          'catalog.processors.latestRelease.enabled',
        );
        if (latestReleaseEnabled) {
          catalog.addProcessor(
            LatestReleaseProcessor.fromConfig({ config, logger }),
          );
        }

        const latestOciReleaseEnabled = config.getOptionalBoolean(
          'catalog.processors.latestOciRelease.enabled',
        );
        if (latestOciReleaseEnabled) {
          catalog.addProcessor(
            LatestOciReleaseProcessor.fromConfig({
              config,
              logger,
              containerRegistry,
            }),
          );
        }

        const klausProviders = KlausProvider.fromConfig({
          config,
          logger,
          scheduler,
        });
        for (const provider of klausProviders) {
          catalog.addEntityProvider(provider);
        }
      },
    });
  },
});
