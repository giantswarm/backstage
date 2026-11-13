import { Config } from '@backstage/config';
import { AuthenticationError, InputError } from '@backstage/errors';
import express from 'express';
import Router from 'express-promise-router';
import { errorResponseBody } from '@giantswarm/backstage-plugin-gs-node';
import {
  AGENT_MANAGER_AUTH_HEADER,
  CREDENTIAL_OPERATION_PATTERN,
} from '@giantswarm/backstage-plugin-agent-platform-common';
import { readInstallationBaseDomain } from './installationDomain';

/**
 * The credential operations of agent-manager (`/api/v1/credential-operations`)
 * as the person: read the confirmation of an operation, save its values, or
 * cancel it. A credential value never enters an MCP call: agent-manager
 * prepares an operation in the organization tool, links to the portal's form
 * with its id, and takes the value only here, over HTTPS, with the person's
 * own ID token, which it checks against the issuer and subject that prepared
 * the operation. The portal's backend carries the call because agent-manager
 * offers the browser no CORS exception.
 *
 * Values are never logged or echoed: the POST body is validated and
 * re-serialized, error answers carry agent-manager's code and message only,
 * and every answer is `Cache-Control: no-store`.
 */

const MAX_VALUES = 16;
const MAX_NAME_LENGTH = 253;
const MAX_VALUE_LENGTH = 16 * 1024;
const READ_TIMEOUT_MS = 30_000;
/**
 * Above agent-manager's own bound on a save (90 s, or the operation's
 * expiry if sooner), so the portal never gives up on a save agent-manager
 * still runs.
 */
const SAVE_TIMEOUT_MS = 120_000;

export interface CredentialOperationsRouterOptions {
  config: Config;
  /** Overridable for tests. */
  fetchFn?: typeof fetch;
  readTimeoutMs?: number;
  saveTimeoutMs?: number;
}

/**
 * agent-manager's REST origin on one installation, with the route's path
 * prefix: `agentPlatform.agentManager.installations.<name>.apiBaseUrl`, else
 * `https://agentgateway.<baseDomain>/agent-manager`, the agent-platform
 * chart's `agentManager.route`. `undefined` for a name that is neither.
 */
export function agentManagerBaseUrl(
  config: Config,
  installation: string,
): string | undefined {
  const configured = config.getOptionalConfig(
    'agentPlatform.agentManager.installations',
  );
  if (configured?.keys().includes(installation)) {
    const url = configured
      .getConfig(installation)
      .getOptionalString('apiBaseUrl');
    if (url) {
      return url.replace(/\/+$/, '');
    }
  }
  const baseDomain = readInstallationBaseDomain(config, installation);
  return baseDomain
    ? `https://agentgateway.${baseDomain}/agent-manager`
    : undefined;
}

interface CredentialValue {
  secret: string;
  key: string;
  value: string;
}

function readName(entry: Record<string, unknown>, field: string): string {
  const value = entry[field];
  if (
    typeof value !== 'string' ||
    value === '' ||
    value.length > MAX_NAME_LENGTH
  ) {
    throw new InputError(
      `values[].${field} must be a name of at most ${MAX_NAME_LENGTH} characters`,
    );
  }
  return value;
}

/** The POST body agent-manager takes, and nothing else. */
export function readValues(body: unknown): CredentialValue[] {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new InputError('the body must be an object with values');
  }
  const extra = Object.keys(body).filter(k => k !== 'values');
  if (extra.length > 0) {
    throw new InputError(`unknown fields: ${extra.join(', ')}`);
  }
  const values = (body as { values?: unknown }).values;
  if (!Array.isArray(values) || values.length > MAX_VALUES) {
    throw new InputError(`values must be a list of at most ${MAX_VALUES}`);
  }
  return values.map(entry => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new InputError('each of values must be an object');
    }
    const fields = Object.keys(entry);
    if (fields.some(f => !['secret', 'key', 'value'].includes(f))) {
      throw new InputError('each of values takes secret, key and value only');
    }
    const value = (entry as Record<string, unknown>).value;
    if (
      typeof value !== 'string' ||
      value === '' ||
      value.length > MAX_VALUE_LENGTH
    ) {
      throw new InputError(
        `values[].value must be a non-empty string of at most ${MAX_VALUE_LENGTH} characters`,
      );
    }
    return {
      secret: readName(entry as Record<string, unknown>, 'secret'),
      key: readName(entry as Record<string, unknown>, 'key'),
      value,
    };
  });
}

function readToken(req: express.Request): string {
  const header = req.headers[AGENT_MANAGER_AUTH_HEADER];
  const token = Array.isArray(header) ? header[0] : header;
  if (!token) {
    throw new AuthenticationError(
      'The request did not include a user token for the target installation.',
    );
  }
  return token;
}

/** The request's `If-Match`, `undefined` when it has none. */
function readIfMatch(req: express.Request): string | undefined {
  const ifMatch = req.headers['if-match'];
  if (ifMatch === undefined || ifMatch === '') {
    return undefined;
  }
  if (typeof ifMatch !== 'string' || !/^"[^"]+"$/.test(ifMatch)) {
    throw new InputError(
      'If-Match must carry the confirmation’s ETag, as read from it',
    );
  }
  return ifMatch;
}

/**
 * Answers an error in the backend's error body (`errorResponseBody`), with
 * agent-manager's `code` on the serialized error, so the form can tell a
 * stale confirmation (`precondition_failed`) from a missing GitHub grant
 * (`auth_required`).
 */
function answerError(
  req: express.Request,
  res: express.Response,
  status: number,
  code: string,
  message: string,
) {
  const error = Object.assign(new Error(message), {
    name: 'AgentManagerError',
    code,
  });
  res.status(status).json(errorResponseBody(error, req, status));
}

const OUTCOME_UNKNOWN_MESSAGE =
  'agent-manager did not answer the save; it may still complete';

/**
 * An error with agent-manager's code is passed on. A POST without that code
 * may have completed, so its outcome must be checked before another save.
 */
async function forwardError(
  req: express.Request,
  res: express.Response,
  upstream: Response,
) {
  let code: string | undefined;
  let message: string | undefined;
  try {
    const body = (await upstream.json()) as {
      error?: { code?: unknown; message?: unknown };
    };
    if (typeof body.error?.code === 'string') {
      code = body.error.code;
    }
    if (typeof body.error?.message === 'string') {
      message = body.error.message;
    }
  } catch {
    // A body that is not agent-manager's JSON (a gateway's page) keeps the
    // generic message.
  }
  const status =
    upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502;
  if (!code && req.method === 'POST') {
    answerError(req, res, status, 'outcome_unknown', OUTCOME_UNKNOWN_MESSAGE);
    return;
  }
  answerError(
    req,
    res,
    status,
    code ?? 'backend_error',
    message ?? `agent-manager answered ${upstream.status}`,
  );
}

export function createCredentialOperationsRouter(
  options: CredentialOperationsRouterOptions,
): express.Router {
  const { config } = options;
  const fetchFn = options.fetchFn ?? fetch;
  const readTimeoutMs = options.readTimeoutMs ?? READ_TIMEOUT_MS;
  const saveTimeoutMs = options.saveTimeoutMs ?? SAVE_TIMEOUT_MS;
  const router = Router();

  const target = (req: express.Request) => {
    const operation = String(req.params.operation);
    if (!CREDENTIAL_OPERATION_PATTERN.test(operation)) {
      throw new InputError('operation must be an agent-manager operation id');
    }
    const installation = req.query.installation;
    if (typeof installation !== 'string' || installation === '') {
      throw new InputError('installation is required');
    }
    const base = agentManagerBaseUrl(config, installation);
    if (!base) {
      throw new InputError(`unknown installation ${installation}`);
    }
    return `${base}/api/v1/credential-operations/${operation}`;
  };

  /**
   * One call to agent-manager. A save that fails in transit may still
   * complete there: it is answered with code `outcome_unknown`, never as a
   * failure, and the form reads the operation again. The status says what
   * happened: 504 for no answer in time, 502 for a lost connection.
   */
  const call = async (
    req: express.Request,
    res: express.Response,
    url: string,
    init: { method: string; headers: Record<string, string>; body?: string },
    timeoutMs: number,
  ): Promise<Response | undefined> => {
    try {
      return await fetchFn(url, {
        ...init,
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const timedOut = (error as Error | undefined)?.name === 'TimeoutError';
      if (init.method === 'POST') {
        answerError(
          req,
          res,
          timedOut ? 504 : 502,
          'outcome_unknown',
          OUTCOME_UNKNOWN_MESSAGE,
        );
      } else {
        answerError(
          req,
          res,
          502,
          'backend_error',
          'agent-manager could not be reached on this installation',
        );
      }
      return undefined;
    }
  };

  /** agent-manager's JSON answer, or a 502 when the body is not JSON. */
  const answerJson = async (
    req: express.Request,
    res: express.Response,
    upstream: Response,
  ) => {
    let body: unknown;
    try {
      body = await upstream.json();
    } catch {
      answerError(
        req,
        res,
        502,
        req.method === 'POST' ? 'outcome_unknown' : 'backend_error',
        req.method === 'POST'
          ? OUTCOME_UNKNOWN_MESSAGE
          : 'agent-manager answered something other than JSON',
      );
      return;
    }
    res.status(200).json(body);
  };

  const path = '/organizations/credential-operations/:operation';

  /** 428 Precondition Required (RFC 6585 §3) for a write without `If-Match`. */
  const answerIfMatchRequired = (req: express.Request, res: express.Response) =>
    answerError(
      req,
      res,
      428,
      'precondition_required',
      'If-Match with the confirmation’s ETag is required',
    );

  // Every answer, refusals of the request itself included.
  router.use(path, (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  router.get(path, async (req, res) => {
    const url = target(req);
    const token = readToken(req);
    const upstream = await call(
      req,
      res,
      url,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      },
      readTimeoutMs,
    );
    if (!upstream) return;
    if (!upstream.ok) {
      await forwardError(req, res, upstream);
      return;
    }
    const etag = upstream.headers.get('etag');
    if (!etag) {
      answerError(
        req,
        res,
        502,
        'backend_error',
        'agent-manager answered the confirmation without its version',
      );
      return;
    }
    res.set('ETag', etag);
    await answerJson(req, res, upstream);
  });

  router.post(path, async (req, res) => {
    const url = target(req);
    const token = readToken(req);
    const ifMatch = readIfMatch(req);
    if (!ifMatch) {
      answerIfMatchRequired(req, res);
      return;
    }
    const values = readValues(req.body);
    const upstream = await call(
      req,
      res,
      url,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'If-Match': ifMatch,
        },
        body: JSON.stringify({ values }),
      },
      saveTimeoutMs,
    );
    if (!upstream) return;
    if (!upstream.ok) {
      await forwardError(req, res, upstream);
      return;
    }
    await answerJson(req, res, upstream);
  });

  router.delete(path, async (req, res) => {
    const url = target(req);
    const token = readToken(req);
    const ifMatch = readIfMatch(req);
    if (!ifMatch) {
      answerIfMatchRequired(req, res);
      return;
    }
    const upstream = await call(
      req,
      res,
      url,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}`, 'If-Match': ifMatch },
      },
      readTimeoutMs,
    );
    if (!upstream) return;
    if (!upstream.ok) {
      await forwardError(req, res, upstream);
      return;
    }
    res.status(204).end();
  });

  return router;
}
