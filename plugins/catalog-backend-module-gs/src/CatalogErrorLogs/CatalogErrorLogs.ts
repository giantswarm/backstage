import type { LoggerService } from '@backstage/backend-plugin-api';
import { CATALOG_ERRORS_TOPIC } from '@backstage/plugin-catalog-backend';
import type { EventsService } from '@backstage/plugin-events-node';
import { isTransientError, readErrorInfo } from '../util/errors';

type CatalogErrorsPayload = {
  entity?: string;
  location?: string;
  errors?: unknown[];
};

/**
 * Logs catalog processing errors, in place of
 * `@backstage/plugin-catalog-backend-module-logs`.
 *
 * That module logs every processing error at `warn`, and our root logger
 * forwards `warn` to Sentry. But a processing error is an already-handled
 * outcome: it is stored on the entity, shown in the catalog UI, and retried on
 * the next processing round. When the cause is a transient upstream failure —
 * a 504 from the GitHub API, a registry that was briefly unreachable — there is
 * nothing for anyone to act on, and at `warn` those bury the errors that do
 * need attention, like a 401 or a file that is really gone.
 *
 * So transient failures are logged at `debug` and everything else stays at
 * `warn`, with the message and metadata unchanged from upstream.
 */
export async function subscribeToCatalogErrors(options: {
  events: EventsService;
  logger: LoggerService;
}): Promise<void> {
  const { events, logger } = options;

  await events.subscribe({
    id: 'catalog-gs-errors',
    topics: [CATALOG_ERRORS_TOPIC],
    async onEvent(params) {
      const { entity, location, errors } =
        params.eventPayload as CatalogErrorsPayload;

      for (const error of errors ?? []) {
        const { message } = readErrorInfo(error);
        const logMessage = message || 'Catalog processing error';
        const meta = { entity, location };

        if (isTransientError(error)) {
          logger.debug(logMessage, meta);
        } else {
          logger.warn(logMessage, meta);
        }
      }
    },
  });
}
