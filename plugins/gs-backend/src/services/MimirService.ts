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

    const baseDomain = this.config.getOptionalString(
      `gs.installations.${installationName}.baseDomain`,
    );

    if (!baseDomain) {
      throw new NotFoundError(
        `No baseDomain configured for installation "${installationName}"`,
      );
    }

    const url = new URL(
      `https://observability.${baseDomain}/prometheus/api/v1/query`,
    );
    url.searchParams.set('query', query);

    this.logger.debug(
      `Proxying Mimir query for installation "${installationName}": ${query}`,
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
      const body = await response.text().catch(() => '');
      throw new ServiceUnavailableError(
        `Mimir returned HTTP ${response.status} for installation "${installationName}": ${body}`,
      );
    }

    return response.json() as Promise<MimirQueryResponse>;
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
