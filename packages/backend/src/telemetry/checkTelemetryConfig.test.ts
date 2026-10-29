import { mockServices } from '@backstage/backend-test-utils';
import type { JsonObject } from '@backstage/types';
import { checkTelemetryConfig } from './checkTelemetryConfig';

function check(data: JsonObject) {
  const logger = mockServices.logger.mock();
  checkTelemetryConfig({ config: mockServices.rootConfig({ data }), logger });
  return logger;
}

describe('checkTelemetryConfig', () => {
  it.each([
    ['an empty app ID', { appID: '', salt: 'salt' }],
    ['a blank app ID', { appID: '  ', salt: 'salt' }],
    ['no app ID', { salt: 'salt' }],
  ])('warns once that usage data is disabled for %s', (_, telemetrydeck) => {
    const logger = check({ app: { telemetrydeck } });

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        'TelemetryDeck usage data is disabled: app.telemetrydeck.appID is empty',
      ),
    );
  });

  it('stays silent for a portal with its own app ID', () => {
    const logger = check({
      app: { telemetrydeck: { appID: 'APP-ID', salt: 'salt' } },
    });

    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('stays silent when telemetry is turned off', () => {
    expect(check({ app: { telemetrydeck: null } }).warn).not.toHaveBeenCalled();
    expect(check({ app: {} }).warn).not.toHaveBeenCalled();
  });
});
