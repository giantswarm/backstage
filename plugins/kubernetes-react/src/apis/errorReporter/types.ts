import { createApiRef } from '@backstage/core-plugin-api';

export interface ErrorReporterApi {
  notify(
    error: Error | string | Record<string, any>,
    extraInfo?: Record<string, any>,
  ): Promise<void>;
}

export const errorReporterApiRef = createApiRef<ErrorReporterApi>({
  id: 'plugin.error-reporter',
});
