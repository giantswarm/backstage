import {
  coreServices,
  createServiceFactory,
} from '@backstage/backend-plugin-api';
import { format, transports } from 'winston';
import Sentry from 'winston-sentry-log';
import { WinstonLogger } from '@backstage/backend-defaults/rootLogger';
import { createConfigSecretEnumerator } from '@backstage/backend-defaults/rootConfig';

export const rootLogger = createServiceFactory({
  service: coreServices.rootLogger,
  deps: {
    config: coreServices.rootConfig,
  },
  async factory({ config }) {
    const trasporters: any[] = [new transports.Console()];
    const logConfig = config.getOptionalConfig('backend.errorReporter.sentry');
    if (logConfig) {
      trasporters.push(
        new Sentry({
          config: {
            dsn: logConfig.getString('dsn'),
            environment: logConfig.getString('environment'),
            releaseVersion: logConfig.getString('releaseVersion'),
            tracesSampleRate: logConfig.getNumber('tracesSampleRate'),
            ignoreErrors: [
              /^Index for techdocs was not created: indexer received 0 documents$/,
              // Benign warning from @pagerduty/backstage-plugin-backend when we
              // use the legacy single-token config (`pagerDuty.apiToken`) instead
              // of the newer `pagerDuty.accounts` format. PagerDuty works fine —
              // the plugin just logs this and falls back to the legacy path. We
              // can't migrate to `accounts`: the plugin's single-account branch
              // never sets its `fallbackEndpointConfig`, so any request without an
              // explicit `account` (which is what our WhoIsOnCallEntityCard sends)
              // throws when resolving the API base URL. See giantswarm/giantswarm#37085.
              /^No PagerDuty accounts configuration found in config file\. Reverting to legacy configuration\.$/,
            ],
          },
          level: 'warn',
        }),
      );
    }

    const logger = WinstonLogger.create({
      level: process.env.LOG_LEVEL || 'info',
      format:
        process.env.NODE_ENV === 'production'
          ? format.json()
          : WinstonLogger.colorFormat(),
      transports: trasporters,
      meta: {
        service: 'backstage',
      },
    });

    const secretEnumerator = await createConfigSecretEnumerator({
      logger,
    });
    logger.addRedactions(secretEnumerator(config));
    config.subscribe?.(() => logger.addRedactions(secretEnumerator(config)));

    return logger;
  },
});
