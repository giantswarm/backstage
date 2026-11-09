import { Config } from '@backstage/config';
import { AuthenticationError, InputError } from '@backstage/errors';
import express from 'express';
import Router from 'express-promise-router';
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

/** Header carrying the person's installation token. Must match AGENT_MANAGER_AUTH_HEADER in plugins/agent-platform. */
export const AGENT_MANAGER_AUTH_HEADER =
  'backstage-agent-manager-authorization';

/** agent-manager's operation ids: 48 lower-case hex characters. */
const OPERATION_PATTERN = /^[a-f0-9]{48}$/;
const MAX_VALUES = 16;
const MAX_NAME_LENGTH = 253;
const MAX_VALUE_LENGTH = 16 * 1024;
const DEFAULT_TIMEOUT_MS = 30_000;

export interface CredentialOperationsRouterOptions {
  config: Config;
  /** Overridable for tests. */
  fetchFn?: typeof fetch;
  timeoutMs?: number;
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

function readIfMatch(req: express.Request): string {
  const ifMatch = req.headers['if-match'];
  if (typeof ifMatch !== 'string' || !/^"[^"]+"$/.test(ifMatch)) {
    throw new InputError(
      'If-Match must carry the confirmation’s ETag, as read from it',
    );
  }
  return ifMatch;
}

/**
 * agent-manager's error answer, `{error: {code, message}}`, as the portal's
 * error body with the code kept, so the form can tell a stale confirmation
 * (`precondition_failed`) from a missing GitHub grant (`auth_required`).
 */
async function forwardError(res: express.Response, upstream: Response) {
  let code = 'backend_error';
  let message = `agent-manager answered ${upstream.status}`;
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
  res.status(status).json({
    error: { name: 'AgentManagerError', message, code },
    response: { statusCode: status },
  });
}

export function createCredentialOperationsRouter(
  options: CredentialOperationsRouterOptions,
): express.Router {
  const { config } = options;
  const fetchFn = options.fetchFn ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const router = Router();

  const target = (req: express.Request) => {
    const { operation } = req.params;
    if (!OPERATION_PATTERN.test(operation)) {
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

  const call = async (
    res: express.Response,
    url: string,
    init: { method: string; headers: Record<string, string>; body?: string },
  ): Promise<Response | undefined> => {
    res.set('Cache-Control', 'no-store');
    try {
      return await fetchFn(url, {
        ...init,
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      res.status(502).json({
        error: {
          name: 'AgentManagerError',
          message: 'agent-manager could not be reached on this installation',
          code: 'backend_error',
        },
        response: { statusCode: 502 },
      });
      return undefined;
    }
  };

  const path = '/organizations/credential-operations/:operation';

  router.get(path, async (req, res) => {
    const url = target(req);
    const token = readToken(req);
    const upstream = await call(res, url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (!upstream) return;
    if (!upstream.ok) {
      await forwardError(res, upstream);
      return;
    }
    const etag = upstream.headers.get('etag');
    if (etag) {
      res.set('ETag', etag);
    }
    res.status(200).json(await upstream.json());
  });

  router.post(path, async (req, res) => {
    const url = target(req);
    const token = readToken(req);
    const ifMatch = readIfMatch(req);
    const values = readValues(req.body);
    const upstream = await call(res, url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'If-Match': ifMatch,
      },
      body: JSON.stringify({ values }),
    });
    if (!upstream) return;
    if (!upstream.ok) {
      await forwardError(res, upstream);
      return;
    }
    res.status(200).json(await upstream.json());
  });

  router.delete(path, async (req, res) => {
    const url = target(req);
    const token = readToken(req);
    const ifMatch = readIfMatch(req);
    const upstream = await call(res, url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}`, 'If-Match': ifMatch },
    });
    if (!upstream) return;
    if (!upstream.ok) {
      await forwardError(res, upstream);
      return;
    }
    res.status(204).end();
  });

  return router;
}
