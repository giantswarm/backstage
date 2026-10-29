import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { checkTelemetryConfig } from './checkTelemetryConfig';

export const telemetryConfigPlugin = createBackendPlugin({
  pluginId: 'telemetry-config',
  register(env) {
    env.registerInit({
      deps: {
        logger: coreServices.logger,
        config: coreServices.rootConfig,
      },
      async init({ logger, config }) {
        checkTelemetryConfig({ config, logger });
      },
    });
  },
});
