import { mockServices } from '@backstage/backend-test-utils';
import { NotFoundError, ServiceUnavailableError } from '@backstage/errors';
import { CATALOG_ERRORS_TOPIC } from '@backstage/plugin-catalog-backend';
import type { EventParams, EventsService } from '@backstage/plugin-events-node';
import { subscribeToCatalogErrors } from './CatalogErrorLogs';

type Logger = ReturnType<typeof mockServices.logger.mock>;

async function publish(payload: unknown, logger: Logger) {
  let onEvent: ((params: EventParams) => Promise<void>) | undefined;
  const events = {
    subscribe: jest.fn(async (subscription: any) => {
      onEvent = subscription.onEvent;
    }),
    publish: jest.fn(),
  } as unknown as EventsService;

  await subscribeToCatalogErrors({ events, logger });
  await onEvent!({
    topic: CATALOG_ERRORS_TOPIC,
    eventPayload: payload as any,
  });
}

const ENTITY = 'location:default/generated-abc';
const LOCATION =
  'giantswarm:https://github.com/giantswarm/backstage-catalogs/blob/v0.3.0/a.yaml';

describe('subscribeToCatalogErrors', () => {
  it('logs transient failures at debug', async () => {
    const logger = mockServices.logger.mock();

    await publish(
      {
        entity: ENTITY,
        location: LOCATION,
        errors: [
          new Error(
            'Unable to read giantswarm https://github.com/giantswarm/backstage-catalogs/blob/v0.3.0/a.yaml, Error: Request failed for https://api.github.com/repos/x, 504 Gateway Timeout',
          ),
        ],
      },
      logger,
    );

    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('504 Gateway Timeout'),
      { entity: ENTITY, location: LOCATION },
    );
  });

  it('keeps actionable failures at warn', async () => {
    const logger = mockServices.logger.mock();

    await publish(
      {
        entity: ENTITY,
        location: LOCATION,
        errors: [new NotFoundError('No such file')],
      },
      logger,
    );

    expect(logger.debug).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith('No such file', {
      entity: ENTITY,
      location: LOCATION,
    });
  });

  it('logs every error of an event', async () => {
    const logger = mockServices.logger.mock();

    await publish(
      {
        entity: ENTITY,
        errors: [
          new NotFoundError('gone'),
          new ServiceUnavailableError('socket hang up'),
        ],
      },
      logger,
    );

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.debug).toHaveBeenCalledTimes(1);
  });

  it('falls back to a fixed message for an error that lost its message in transit', async () => {
    const logger = mockServices.logger.mock();

    await publish({ entity: ENTITY, errors: [{}] }, logger);

    expect(logger.warn).toHaveBeenCalledWith('Catalog processing error', {
      entity: ENTITY,
      location: undefined,
    });
  });

  it('tolerates an event without errors', async () => {
    const logger = mockServices.logger.mock();

    await publish({ entity: ENTITY }, logger);

    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.debug).not.toHaveBeenCalled();
  });
});
