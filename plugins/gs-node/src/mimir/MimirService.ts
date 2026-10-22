import {
  coreServices,
  createServiceFactory,
  createServiceRef,
  LoggerService,
  RootConfigService,
} from '@backstage/backend-plugin-api';
import {
  AuthenticationError,
  NotFoundError,
  ServiceUnavailableError,
} from '@backstage/errors';
import { Expand } from '@backstage/types';
import fetch from 'node-fetch';

const REQUEST_TIMEOUT_MS = 30_000;

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

export class MimirService {
  static create(options: {
    config: RootConfigService;
    logger: LoggerService;
  }): MimirService {
    return new MimirService(options.config, options.logger);
  }

  private constructor(
    private readonly config: RootConfigService,
    private readonly logger: LoggerService,
  ) {}

  async query(options: {
    installationName: string;
    query: string;
    oidcToken: string;
  }): Promise<MimirQueryResponse> {
    const { installationName, query, oidcToken } = options;

    return this.fetchPrometheus<MimirQueryResponse>({
      installationName,
      path: 'query',
      params: { query },
      oidcToken,
    });
  }

  /**
   * A PromQL query evaluated at every `step` across `[start, end]`, for a
   * series over time rather than one value.
   *
   * `start` and `end` are Unix seconds and `step` is a Prometheus duration
   * (`60s`, `1d`) or a number of seconds — both are passed through to Mimir
   * verbatim, so the caller owns the alignment. Mimir refuses a range that
   * would exceed its point limit (11k per series by default), which surfaces
   * here as `ServiceUnavailableError` carrying its message.
   */
  async queryRange(options: {
    installationName: string;
    query: string;
    start: string;
    end: string;
    step: string;
    oidcToken: string;
  }): Promise<MimirRangeQueryResponse> {
    const { installationName, query, start, end, step, oidcToken } = options;

    return this.fetchPrometheus<MimirRangeQueryResponse>({
      installationName,
      path: 'query_range',
      params: { query, start, end, step },
      oidcToken,
    });
  }

  /**
   * The shared leg of both queries: resolve the installation's Mimir, call it
   * with the user's OIDC token, and turn every failure into the error class
   * that describes it.
   *
   * Both endpoints have identical auth, tenancy and failure behaviour, so this
   * is the one place either can be got wrong.
   */
  private async fetchPrometheus<T>(options: {
    installationName: string;
    path: 'query' | 'query_range';
    params: Record<string, string>;
    oidcToken: string;
  }): Promise<T> {
    const { installationName, path, params, oidcToken } = options;

    // `mimirEnabled: false` opts an installation out of the observability
    // integration entirely (standalone installations have no Mimir at
    // `observability.<baseDomain>`, even though `baseDomain` is set for other
    // features). Refusing here keeps the frontend gate honest.
    const mimirEnabled = this.config.getOptionalBoolean(
      `gs.installations.${installationName}.mimirEnabled`,
    );
    if (mimirEnabled === false) {
      throw new NotFoundError(
        `Mimir is not enabled for installation "${installationName}"`,
      );
    }

    const baseDomain = this.config.getOptionalString(
      `gs.installations.${installationName}.baseDomain`,
    );

    if (!baseDomain) {
      throw new NotFoundError(
        `No baseDomain configured for installation "${installationName}"`,
      );
    }

    const url = new URL(
      `https://observability.${baseDomain}/prometheus/api/v1/${path}`,
    );
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    this.logger.debug(
      `Proxying Mimir ${path} for installation "${installationName}": ${params.query}`,
    );

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let response;
    try {
      response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${oidcToken}`,
          'X-Scope-OrgID': 'giantswarm',
          Accept: 'application/json',
        },
        signal: controller.signal,
      });
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new ServiceUnavailableError(
          `Mimir request timed out after ${REQUEST_TIMEOUT_MS}ms`,
        );
      }
      throw new ServiceUnavailableError(
        `Mimir unreachable for installation "${installationName}": ${err.message}`,
      );
    } finally {
      clearTimeout(timeoutId);
    }

    if (response.status === 401 || response.status === 403) {
      throw new AuthenticationError(
        `Mimir rejected the OIDC token for installation "${installationName}" (HTTP ${response.status})`,
      );
    }

    if (!response.ok) {
      const contentType = response.headers.get('content-type') ?? '';
      const body = await response.text().catch(() => '');
      const truncated = body.length > 300 ? `${body.slice(0, 300)}…` : body;

      if (response.status === 400 && contentType.includes('text/html')) {
        throw new AuthenticationError(
          `Mimir gateway rejected the request for installation "${installationName}" (HTTP 400)`,
        );
      }

      throw new ServiceUnavailableError(
        `Mimir returned HTTP ${response.status} for installation "${installationName}": ${truncated}`,
      );
    }

    return response.json() as Promise<T>;
  }
}

export const mimirServiceRef = createServiceRef<Expand<MimirService>>({
  id: 'mimir',
  defaultFactory: async service =>
    createServiceFactory({
      service,
      deps: {
        config: coreServices.rootConfig,
        logger: coreServices.logger,
      },
      async factory(deps) {
        return MimirService.create(deps);
      },
    }),
});
