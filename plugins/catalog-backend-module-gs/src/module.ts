import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';
import {
  catalogProcessingExtensionPoint,
  catalogServiceRef,
} from '@backstage/plugin-catalog-node';
import { GiantSwarmLocationProcessor } from './GiantSwarmLocationProcessor';
import { KlausPersonalitiesProvider } from './KlausPersonalitiesProvider';
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

        const klausPersonalitiesEnabled = config.getOptionalBoolean(
          'catalog.providers.klausPersonalities.enabled',
        );
        if (klausPersonalitiesEnabled) {
          catalog.addEntityProvider(
            KlausPersonalitiesProvider.fromConfig({
              config,
              logger,
              scheduler,
            }),
          );
        }
      },
    });
  },
});
