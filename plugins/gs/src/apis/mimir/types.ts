import { createApiRef } from '@backstage/core-plugin-api';

export interface MimirMetricSample {
  metric: Record<string, string>;
  value: [number, string];
}

export interface MimirQueryData {
  resultType: string;
  result: MimirMetricSample[];
}

export interface MimirQueryResponse {
  status: string;
  data: MimirQueryData;
  errorType?: string;
  error?: string;
}

export interface MimirApi {
  query(params: {
    installationName: string;
    query: string;
    oidcToken: string;
  }): Promise<MimirQueryResponse>;
}

export const mimirApiRef = createApiRef<MimirApi>({
  id: 'plugin.gs.mimir',
});
