import type {
  LoggerService,
  RootConfigService,
} from '@backstage/backend-plugin-api';

/**
 * Warns once when telemetry is enabled (`app.telemetrydeck` set) but names no
 * app ID: the frontend then sends no usage data at all, not even page views.
 * `app.telemetrydeck: null` turns telemetry off and stays silent.
 */
export function checkTelemetryConfig(options: {
  config: RootConfigService;
  logger: LoggerService;
}): void {
  const { config, logger } = options;
  const telemetryConfig = config.getOptionalConfig('app.telemetrydeck');
  if (!telemetryConfig) {
    return;
  }

  // Not getOptionalString: the config reader refuses an empty string, the
  // base config's value.
  const appID = telemetryConfig.getOptional('appID');
  if (typeof appID === 'string' && appID.trim()) {
    return;
  }

  logger.warn(
    'TelemetryDeck usage data is disabled: app.telemetrydeck.appID is empty. ' +
      "Set the installation's own app ID to report usage, " +
      'or set app.telemetrydeck to null to turn telemetry off.',
  );
}
