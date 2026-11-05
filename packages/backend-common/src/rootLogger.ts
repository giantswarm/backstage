import {
  coreServices,
  createServiceFactory,
  RootConfigService,
} from '@backstage/backend-plugin-api';
import { format, transports } from 'winston';
import Sentry from 'winston-sentry-log';
import { WinstonLogger } from '@backstage/backend-defaults/rootLogger';
import { createConfigSecretEnumerator } from '@backstage/backend-defaults/rootConfig';
import { normalizeSentryEvent, SentryEvent } from './normalizeSentryEvent';
import { isStartupPollFailure, STARTUP_REQUEST_FAILURE } from './startupRace';

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
      // TechDocs are built on first view, so the collator often has nothing
      // to index. The verb differs by engine and state ("created" in memory
      // until a run indexes something, "replaced" otherwise and always on
      // Postgres), so any verb matches; searchIndexWarnings.test.ts checks
      // the upstream wording. TechDocs only: an empty catalog index is a real
      // fault, and so is "an error was encountered".
      // See giantswarm/giantswarm#38983.
      /^Index for techdocs was not \w+: indexer received 0 documents$/,
      // Benign warning from @pagerduty/backstage-plugin-backend when we
      // use the legacy single-token config (`pagerDuty.apiToken`) instead
      // of the newer `pagerDuty.accounts` format. PagerDuty works fine —
      // the plugin just logs this and falls back to the legacy path. We
      // can't migrate to `accounts`: the plugin's single-account branch
      // never sets its `fallbackEndpointConfig`, so any request without an
      // explicit `account` (which is what our WhoIsOnCallEntityCard sends)
      // throws when resolving the API base URL. See giantswarm/giantswarm#37085.
      /^No PagerDuty accounts configuration found in config file\. Reverting to legacy configuration\.$/,
      // A request that reached the backend before it finished starting up;
      // the caller retries. See giantswarm/giantswarm#37351.
      STARTUP_REQUEST_FAILURE,
      // http-proxy-middleware's own log of a failed Kubernetes proxy request,
      // next to the backend's "Kubernetes proxy error" for the same failure,
      // which names the cluster and the cause. The library logs the target's
      // `href`, and the Kubernetes proxy's per-request target (from its
      // `router`) has none, hence "to undefined". The proxy backend's
      // endpoints have a URL as their target and no other log of a failure,
      // so their lines still reach Sentry. The cluster in this line's extra
      // data is unreliable: the library's logger is global, so it is the one
      // whose proxy was set up last. See giantswarm/giantswarm#39002.
      /^\[HPM\] Error occurred while proxying request \S+ to undefined /,
    ],
    // The events poll loop's startup failures need the event's cause, which
    // `ignoreErrors` cannot see.
    beforeSend: <T extends SentryEvent>(event: T) =>
      isStartupPollFailure(event) ? null : normalizeSentryEvent(event),
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
