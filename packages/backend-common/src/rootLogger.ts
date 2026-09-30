import {
  coreServices,
  createServiceFactory,
  RootConfigService,
} from '@backstage/backend-plugin-api';
import { format, transports } from 'winston';
import Sentry from 'winston-sentry-log';
import { WinstonLogger } from '@backstage/backend-defaults/rootLogger';
import { createConfigSecretEnumerator } from '@backstage/backend-defaults/rootConfig';
import { normalizeSentryEvent } from './normalizeSentryEvent';

/**
 * The options of the Sentry transport, passed to `Sentry.init` as they are;
 * `undefined` when backend Sentry is not configured.
 */
export function getSentryTransportConfig(config: RootConfigService) {
  const sentryConfig = config.getOptionalConfig('backend.errorReporter.sentry');
  if (!sentryConfig) {
    return undefined;
  }
  return {
    dsn: sentryConfig.getString('dsn'),
    environment: sentryConfig.getString('environment'),
    release:
      sentryConfig.getOptionalString('releaseVersion') ??
      config.getOptionalString('app.releaseVersion'),
    // A release would otherwise turn on one release-health session per
    // backend process.
    autoSessionTracking: false,
    tracesSampleRate: sentryConfig.getNumber('tracesSampleRate'),
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
    beforeSend: normalizeSentryEvent,
  };
}

export const rootLogger = createServiceFactory({
  service: coreServices.rootLogger,
  deps: {
    config: coreServices.rootConfig,
  },
  async factory({ config }) {
    const trasporters: any[] = [new transports.Console()];
    const sentryConfig = getSentryTransportConfig(config);
    if (sentryConfig) {
      trasporters.push(new Sentry({ config: sentryConfig, level: 'warn' }));
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
