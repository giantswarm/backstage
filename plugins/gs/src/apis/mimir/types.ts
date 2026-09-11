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

/**
 * One series of a range query: the same labels as an instant sample, but many
 * `[timestamp, value]` pairs instead of one.
 */
export interface MimirMatrixSample {
  metric: Record<string, string>;
  values: [number, string][];
}

export interface MimirRangeQueryData {
  resultType: string;
  result: MimirMatrixSample[];
}

export interface MimirRangeQueryResponse {
  status: string;
  data: MimirRangeQueryData;
  errorType?: string;
  error?: string;
}

export interface MimirApi {
  query(params: {
    installationName: string;
    query: string;
    oidcToken: string;
  }): Promise<MimirQueryResponse>;

  /**
   * A PromQL query evaluated at every `step` across `[start, end]`.
   *
   * `start`/`end` are Unix seconds and `step` a Prometheus duration or a
   * number of seconds, both passed through to Mimir verbatim — the caller owns
   * the alignment.
   */
  queryRange(params: {
    installationName: string;
    query: string;
    start: string;
    end: string;
    step: string;
    oidcToken: string;
  }): Promise<MimirRangeQueryResponse>;
}

export const mimirApiRef = createApiRef<MimirApi>({
  id: 'plugin.gs.mimir',
});
