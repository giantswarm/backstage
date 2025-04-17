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
