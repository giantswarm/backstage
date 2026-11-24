import {
  coreServices,
  createServiceFactory,
  createServiceRef,
  LoggerService,
  RootConfigService,
} from '@backstage/backend-plugin-api';
import {
  AuthenticationError,
  InputError,
  NotFoundError,
} from '@backstage/errors';
import { Expand, JsonObject } from '@backstage/types';
import fetch from 'node-fetch';
import {
  MimirUnavailableError,
  mimirErrorText,
  mimirUnavailableReason,
} from './MimirUnavailableError';
import {
  EnforcedMatchers,
  enforceMatchers,
  isLabelName,
  QueryRefusedError,
} from '@giantswarm/backstage-plugin-gs-common';

const REQUEST_TIMEOUT_MS = 30_000;

const DEFAULT_TENANT = 'giantswarm';

interface MimirTarget {
  /** Without a trailing slash; `/prometheus/api/v1/…` is appended. */
  baseUrl: string;
  tenant: string;
  /** `undefined` when the installation's queries are sent as they are. */
  matchers?: EnforcedMatchers;
}

/**
 * `gs.installations.<name>.mimir.matchers`, read as a raw object: a label name
 * like `__tenant` or `label_1` is not a valid config key, so `keys()` would
 * refuse it. An empty map is no matchers.
 */
function readMatchers(
  config: RootConfigService,
  key: string,
): EnforcedMatchers | undefined {
  const raw = config.getOptional<JsonObject>(key);
  if (raw === undefined) {
    return undefined;
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error(`Invalid config at ${key}: expected a map of label values`);
  }
  const matchers: EnforcedMatchers = {};
  for (const [name, value] of Object.entries(raw)) {
    if (!isLabelName(name) || typeof value !== 'string') {
      throw new Error(
        `Invalid config at ${key}.${name}: expected a label name with a string value`,
      );
    }
    matchers[name] = value;
  }
  return Object.keys(matchers).length > 0 ? matchers : undefined;
}

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

  /**
   * `redactQuery` keeps the PromQL out of the debug log, for a query that
   * names a person (a `user` matcher built from the caller's identity).
   *
   * `logFailures: false` is for a caller that handles a failed query itself
   * and logs it at its own level: the service then logs it at `debug`
   * instead of warning, which would report it to Sentry.
   */
  async query(options: {
    installationName: string;
    query: string;
    oidcToken: string;
    redactQuery?: boolean;
    logFailures?: boolean;
  }): Promise<MimirQueryResponse> {
    const { installationName, query, oidcToken, redactQuery, logFailures } =
      options;

    return this.fetchPrometheus<MimirQueryResponse>({
      installationName,
      path: 'query',
      params: { query },
      oidcToken,
      redactQuery,
      logFailures,
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
   * here as an `InputError` carrying its text.
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
   * Where an installation's queries go, and the matchers they must carry.
   * `gs.installations.<name>.mimir` sets the address, the tenant and the
   * matchers; without it, the installation's own Mimir at
   * `observability.<baseDomain>`, tenant `giantswarm`, and no matchers.
   */
  private resolveTarget(installationName: string): MimirTarget {
    const prefix = `gs.installations.${installationName}`;

    // `mimirEnabled: false` opts an installation out of the observability
    // integration entirely (standalone installations have no Mimir at
    // `observability.<baseDomain>`, even though `baseDomain` is set for other
    // features). Refusing here keeps the frontend gate honest.
    const mimirEnabled = this.config.getOptionalBoolean(
      `${prefix}.mimirEnabled`,
    );
    if (mimirEnabled === false) {
      throw new NotFoundError(
        `Mimir is not enabled for installation "${installationName}"`,
      );
    }

    const tenant =
      this.config.getOptionalString(`${prefix}.mimir.tenant`) ?? DEFAULT_TENANT;
    const matchers = readMatchers(this.config, `${prefix}.mimir.matchers`);

    const url = this.config.getOptionalString(`${prefix}.mimir.url`);
    if (url) {
      return { baseUrl: url.replace(/\/+$/, ''), tenant, matchers };
    }

    const baseDomain = this.config.getOptionalString(`${prefix}.baseDomain`);
    if (!baseDomain) {
      throw new NotFoundError(
        `No baseDomain configured for installation "${installationName}"`,
      );
    }
    return { baseUrl: `https://observability.${baseDomain}`, tenant, matchers };
  }

  /**
   * The shared leg of both queries: resolve the installation's Mimir, limit
   * the query to the installation's matchers, call it with the user's OIDC
   * token, and turn every failure into the error class that describes it:
   *
   * - a refused token: `AuthenticationError` (401), which the person can act
   *   on by signing in again;
   * - a query that could not be limited to the installation's matchers:
   *   `InputError` (400), never sent;
   * - a query Mimir refused (any other 4xx: bad PromQL, a range over its
   *   limits): `InputError` (400) with Mimir's text, which asking again would
   *   not change, and not logged, since nothing is down;
   * - Mimir down, slow or failing (a 5xx, no answer): `MimirUnavailableError`
   *   (503), logged here once as a warning.
   *
   * Both endpoints have identical auth, tenancy and failure behaviour, so this
   * is the one place either can be got wrong.
   */
  private async fetchPrometheus<T>(options: {
    installationName: string;
    path: 'query' | 'query_range';
    params: { query: string } & Record<string, string>;
    oidcToken: string;
    redactQuery?: boolean;
    logFailures?: boolean;
  }): Promise<T> {
    const {
      installationName,
      path,
      params,
      oidcToken,
      redactQuery,
      logFailures = true,
    } = options;

    const target = this.resolveTarget(installationName);

    const url = new URL(`${target.baseUrl}/prometheus/api/v1/${path}`);
    const sent = { ...params };
    if (target.matchers) {
      try {
        sent.query = enforceMatchers(params.query, target.matchers);
      } catch (error) {
        if (!(error instanceof QueryRefusedError)) {
          throw error;
        }
        // Handled, at `info`: the query never leaves, and nothing is down.
        this.logger.info(`Refused a Mimir ${path} that could not be limited`, {
          installation: installationName,
          endpoint: path,
          reason: error.message,
        });
        throw new InputError(
          `Mimir ${path} for installation "${installationName}" was not sent: ${error.message}`,
        );
      }
    }
    for (const [key, value] of Object.entries(sent)) {
      url.searchParams.set(key, value);
    }

    this.logger.debug(
      `Proxying Mimir ${path} for installation "${installationName}": ${
        redactQuery ? '(query redacted)' : sent.query
      }`,
    );

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    // Every outage below is logged here, once, as a warning with a fixed
    // message: Sentry groups on the message, so the installation and Mimir's
    // own text (a block ID, a pod address) go in the metadata. The error
    // thrown is already reported, and the routes answer it without the error
    // middleware logging it again. A caller that handles the failure itself
    // asks for `debug` instead.
    const metadata = { installation: installationName, endpoint: path };
    const reportFailure = (message: string, meta: JsonObject) =>
      logFailures
        ? this.logger.warn(message, meta)
        : this.logger.debug(message, meta);

    let response;
    try {
      response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${oidcToken}`,
          'X-Scope-OrgID': target.tenant,
          Accept: 'application/json',
        },
        signal: controller.signal,
      });
    } catch (err: any) {
      if (err.name === 'AbortError') {
        reportFailure(
          `Mimir did not answer a query within ${REQUEST_TIMEOUT_MS / 1000}s`,
          metadata,
        );
        throw new MimirUnavailableError(
          `Mimir did not answer within ${
            REQUEST_TIMEOUT_MS / 1000
          } seconds for installation "${installationName}"`,
        );
      }
      // node-fetch names the whole URL in its message, the PromQL with it,
      // which can name a person (`redactQuery`): keep only where it went.
      const mimirError = String(err?.message ?? err)
        .split(url.toString())
        .join(`${url.origin}${url.pathname}`);
      reportFailure('Mimir could not be reached', {
        ...metadata,
        mimirError,
      });
      throw new MimirUnavailableError(
        `Mimir could not be reached for installation "${installationName}"`,
        { mimirError },
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

      if (response.status === 400 && contentType.includes('text/html')) {
        throw new AuthenticationError(
          `Mimir gateway rejected the request for installation "${installationName}" (HTTP 400)`,
        );
      }

      const { status } = response;
      const mimirError = mimirErrorText(body);

      // Mimir refused the query itself: asking again gets the same answer,
      // and nothing is down. A 4xx the error middleware does not report, and
      // Mimir's text is what the person needs to read.
      if (status < 500) {
        throw new InputError(
          `Mimir refused the query for installation "${installationName}" (HTTP ${status}): ${mimirError}`,
        );
      }

      const reason = mimirUnavailableReason(mimirError);
      reportFailure(
        reason === 'older_data_unavailable'
          ? 'Mimir could not read older data: no healthy store-gateway'
          : `Mimir answered a query with HTTP ${status}`,
        { ...metadata, status, mimirError },
      );
      throw new MimirUnavailableError(
        `Mimir could not answer the query for installation "${installationName}" (HTTP ${status})`,
        { reason, mimirError },
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
