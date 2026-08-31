import { LoggerService } from '@backstage/backend-plugin-api';
import { Config } from '@backstage/config';
import {
  AuthenticationError,
  InputError,
  ServiceUnavailableError,
} from '@backstage/errors';
import express from 'express';
import Router from 'express-promise-router';
import {
  DEFAULT_KAGENT_TIMEOUT_MS,
  DEFAULT_KAGENT_TURN_TIMEOUT_MS,
  isTurnPendingError,
  KAGENT_AUTH_HEADER,
  KagentClient,
  KagentInstallationConfig,
  MESSAGE_TEXT_MAX_LENGTH,
  readKagentInstallationsFromConfig,
  SESSION_NAME_MAX_LENGTH,
} from './KagentClient';

export interface RouterOptions {
  logger: LoggerService;
  config: Config;
  /** Overridable for tests; used as the client for every installation. */
  client?: KagentClient;
}

function singleQueryValue(value: unknown, name: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new InputError(`${name} must be provided at most once`);
  }
  return value;
}

/**
 * A required, non-empty string field from a JSON body.
 *
 * Trimmed before the emptiness check, so a field of pure whitespace is rejected
 * rather than forwarded to kagent as an empty value. An `InputError` answers 400
 * — `MiddlewareFactory.error()` forwards anything `>= 500` to Sentry, and a
 * malformed body is the caller's mistake, not a fault anyone can act on.
 */
function readRequiredString(
  body: Record<string, unknown>,
  field: string,
): string {
  const value = body[field];
  if (typeof value !== 'string') {
    throw new InputError(`${field} must be a string`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new InputError(`${field} must not be empty`);
  }
  return trimmed;
}

/**
 * A session title, bounded. Shared by the create and rename routes so the two
 * cannot drift apart — a title accepted by one and refused by the other would be
 * a create the user could not undo by renaming.
 */
function readSessionName(body: Record<string, unknown>): string {
  const name = readRequiredString(body, 'name');
  if (name.length > SESSION_NAME_MAX_LENGTH) {
    throw new InputError(
      `name must be at most ${SESSION_NAME_MAX_LENGTH} characters`,
    );
  }
  return name;
}

export async function createRouter(
  options: RouterOptions,
): Promise<express.Router> {
  const { logger, config } = options;

  const installations = readKagentInstallationsFromConfig(config, logger);
  const timeoutMs =
    config.getOptionalNumber('agentPlatform.kagent.timeoutMs') ??
    DEFAULT_KAGENT_TIMEOUT_MS;
  const turnTimeoutMs =
    config.getOptionalNumber('agentPlatform.kagent.turnTimeoutMs') ??
    DEFAULT_KAGENT_TURN_TIMEOUT_MS;

  // One client per installation. When a client is injected (tests), reuse it
  // for every installation, synthesizing one if none is configured so routing
  // still resolves.
  const clients = new Map<string, KagentClient>();
  if (options.client) {
    if (installations.size === 0) {
      installations.set('test', {
        name: 'test',
        apiBaseUrl: 'https://kagent.test/api',
      });
    }
    for (const name of installations.keys()) {
      clients.set(name, options.client);
    }
  } else {
    for (const [name, installation] of installations) {
      clients.set(
        name,
        new KagentClient(installation, logger, fetch, timeoutMs, turnTimeoutMs),
      );
      logger.info(
        `kagent proxy installation '${name}' pointed at ${installation.apiBaseUrl}`,
      );
    }
  }

  if (installations.size === 0) {
    logger.info(
      'No kagent installations resolved (needs gs.installations entries with a baseDomain, or an explicit agentPlatform.kagent.installations block); kagent endpoints will return 503.',
    );
  }

  const router = Router();

  // Raised from the 100 kB default for headroom, so that
  // `MESSAGE_TEXT_MAX_LENGTH` is the limit a caller actually meets. That bound
  // counts UTF-16 code units, whose worst case in UTF-8 is three bytes each
  // (CJK) — 32,000 of them is ~96 kB, which clears the default by only a few kB
  // once the rest of the body is counted. Too close to rely on: a message the
  // proxy considers valid would be refused with a 413 that explains nothing.
  router.use(express.json({ limit: '256kb' }));

  router.get('/health', (_, res) => {
    res.json({ status: 'ok', configured: clients.size });
  });

  /**
   * The installations this proxy can reach kagent on. Names only, on purpose:
   * the URL is derived from `baseDomain`, which is backend-only because it
   * deanonymizes customers. The frontend intersects these with the
   * installations it already considers reachable.
   */
  router.get('/kagent/installations', (_, res) => {
    res.json({
      installations: [...installations.keys()]
        .sort((a, b) => a.localeCompare(b))
        .map(name => ({ name })),
    });
  });

  /**
   * Resolve the target installation from `?installation=`. Always required:
   * the fleet normally has several installations, so there is no sensible
   * default to fall back to.
   */
  const resolveInstallation = (
    req: express.Request,
  ): { config: KagentInstallationConfig; client: KagentClient } => {
    if (clients.size === 0) {
      // Kept as a 503 — unlike "kagent is absent on this installation", nothing
      // configured at all is a genuine misconfiguration worth a Sentry event. It
      // also cannot spam: with no installations resolved, `/kagent/installations`
      // returns an empty list and the frontend queries nothing, so this is only
      // ever reached by a hand-made request.
      throw new ServiceUnavailableError(
        'No kagent installation is configured. Add gs.installations entries with a baseDomain, or set agentPlatform.kagent.installations.',
      );
    }

    const configured = [...clients.keys()].join(', ');
    const name = singleQueryValue(req.query.installation, 'installation');
    if (!name) {
      throw new InputError(
        `installation query parameter is required; configured installations: ${configured}`,
      );
    }

    const client = clients.get(name);
    const installationConfig = installations.get(name);
    if (!client || !installationConfig) {
      throw new InputError(
        `Unknown kagent installation '${name}'; configured installations: ${configured}`,
      );
    }
    return { config: installationConfig, client };
  };

  /**
   * Read the forwarded per-installation Dex ID token.
   *
   * Required for data reads: kagent scopes sessions to the token's `sub`, so
   * without one the request would either be rejected or (under kagent's
   * `unsecure` mode) silently answered for a shared default user. Failing fast
   * with a 401 is something the frontend can act on.
   */
  const readUserToken = (
    req: express.Request,
    opts: { required: boolean },
  ): string | undefined => {
    const headerValue = req.headers[KAGENT_AUTH_HEADER];
    const token = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    if (!token && opts.required) {
      throw new AuthenticationError(
        'The request did not include a user token for the target kagent installation.',
      );
    }
    return token;
  };

  /**
   * Read the session id from the path.
   *
   * Session ids are **opaque**: real kagent responses mix 64-character hex
   * strings and UUIDs, so nothing here validates or normalizes one. In
   * particular there is deliberately no `trim()` — Express hands us the decoded
   * segment, so an id with surrounding whitespace would be trimmed here,
   * re-encoded on the way out, and a *different* id sent upstream, producing a
   * 404 indistinguishable from a missing session.
   *
   * This is purely a typing shim: `req.params` is loosely typed, but `:sessionId`
   * cannot match an empty segment, so `/kagent/sessions/` reaches the list route
   * above rather than arriving here empty (pinned by a test).
   */
  const readSessionId = (req: express.Request): string => {
    const raw = req.params.sessionId;
    return typeof raw === 'string' ? raw : '';
  };

  router.get('/kagent/sessions', async (req, res) => {
    const { client } = resolveInstallation(req);
    const result = await client.listSessions({
      userToken: readUserToken(req, { required: true }),
    });
    res.json(result);
  });

  /**
   * Start a session for one agent.
   *
   * The agent's real namespace and name come from the body rather than being
   * decoded from anything: kagent's "python identifier" encoding of `agent_id`
   * replaces every `-` with `_`, so decoding it is lossy. The caller picked the
   * agent and knows both, so it says so.
   *
   * `name` is required here even though kagent's own API treats it as optional,
   * because the controller does not auto-title — a session created without one
   * has no title at all. The frontend derives it from the first prompt; see
   * "Starting a session" in docs/agent-platform.md.
   *
   * The token is **required**, for the same reason the other writes require it:
   * kagent decides whose session this is from the token alone.
   *
   * Nothing expected reaches a 5xx. A malformed body is a 400, an agent kagent
   * cannot resolve becomes a 409, and a sandbox agent that already holds its one
   * permitted session stays a 409 — `MiddlewareFactory.error()` forwards anything
   * `>= 500` to Sentry.
   */
  router.post('/kagent/sessions', async (req, res) => {
    const { client } = resolveInstallation(req);

    const body = (req.body ?? {}) as Record<string, unknown>;
    const agentNamespace = readRequiredString(body, 'agentNamespace');
    const agentName = readRequiredString(body, 'agentName');
    const name = readSessionName(body);

    const result = await client.createSession(
      { namespace: agentNamespace, name: agentName },
      name,
      { userToken: readUserToken(req, { required: true }) },
    );

    // 201, matching kagent's own answer to this route. The body is its envelope
    // verbatim: the frontend needs the generated session id out of it, and this
    // proxy stays transport.
    res.status(201).json(result);
  });

  /**
   * One session's metadata and stored events. Express matches these paths
   * exactly, so this and the list route above do not shadow each other.
   *
   * A session that belongs to someone else answers 404 exactly as a deleted one
   * does — kagent scopes the lookup by user id. That is an expected outcome for a
   * stale deep link, so it stays a 404 and never becomes a 5xx (which
   * `MiddlewareFactory.error()` would forward to Sentry).
   */
  router.get('/kagent/sessions/:sessionId', async (req, res) => {
    const { client } = resolveInstallation(req);
    const result = await client.getSession(readSessionId(req), {
      userToken: readUserToken(req, { required: true }),
    });
    res.json(result);
  });

  /**
   * Delete one session. kagent soft-deletes it, scoped to the forwarded token's
   * user id — the same scoping the reads rely on.
   *
   * The token is **required**, and it is the whole authorization story for this
   * route: kagent decides who the caller is from it, and a controller running in
   * `unsecure` mode would otherwise delete the shared default user's session on
   * behalf of nobody in particular.
   *
   * Nothing expected reaches a 5xx here. kagent answers 200 even when the session
   * does not exist or belongs to somebody else (its statement matches no rows), and
   * `KagentClient` maps an unreachable installation to a 404 — so this route should
   * never hit `MiddlewareFactory.error()`'s `>= 500` branch, which forwards to
   * Sentry.
   */
  router.delete('/kagent/sessions/:sessionId', async (req, res) => {
    const { client } = resolveInstallation(req);
    const result = await client.deleteSession(readSessionId(req), {
      userToken: readUserToken(req, { required: true }),
    });

    // Pass an empty upstream success through as one, rather than as `res.json()`'s
    // empty body with a JSON content-type. Only reachable if a future kagent
    // answers 204 to the delete; today it returns its envelope with a 200.
    if (result === undefined) {
      res.status(204).end();
      return;
    }

    res.json(result);
  });

  /**
   * Rename one session.
   *
   * The token is **required** for the same reason the delete route requires it:
   * kagent decides whose session this is from the token alone, and under
   * `unsecure` mode this would otherwise rename the shared default user's
   * session on behalf of nobody in particular.
   *
   * The name is all this takes. On a kagent too old to rename properly the
   * client reads the session back and echoes its own agent and source into the
   * upsert — deliberately not something the caller supplies, since those fields
   * are overwritten by that write and a stale value from a browser would blank a
   * column nobody asked to touch.
   *
   * A rejected name is the caller's mistake and answers 400, not a 5xx —
   * `MiddlewareFactory.error()` forwards anything `>= 500` to Sentry.
   */
  router.put('/kagent/sessions/:sessionId', async (req, res) => {
    const { client } = resolveInstallation(req);

    const name = readSessionName((req.body ?? {}) as Record<string, unknown>);

    const result = await client.updateSessionName(readSessionId(req), name, {
      userToken: readUserToken(req, { required: true }),
    });

    // As on the delete: pass an empty upstream success through as one rather
    // than as an empty body with a JSON content-type.
    if (result === undefined) {
      res.status(204).end();
      return;
    }

    res.json(result);
  });

  /** The session's A2A tasks — the conversation, its state and token usage. */
  router.get('/kagent/sessions/:sessionId/tasks', async (req, res) => {
    const { client } = resolveInstallation(req);
    const result = await client.listSessionTasks(readSessionId(req), {
      userToken: readUserToken(req, { required: true }),
    });
    res.json(result);
  });

  /**
   * Send a message to the session's agent — one turn of the conversation.
   *
   * Session-shaped rather than agent-shaped (`/a2a/:ns/:name`) because the session
   * is what the caller is looking at, and because `contextId` is the only thing
   * binding a turn to a session. The A2A JSON-RPC envelope is built in the client,
   * so the frontend never has to know A2A.
   *
   * **The agent's namespace and name come from the body, not from the session.**
   * kagent's stored `agent_id` is an encoding that rewrites `-` to `_`, so
   * decoding it cannot round-trip a name that legitimately contains `_`. The
   * caller resolved the real names from the `Agent` resource; this trusts them and
   * lets kagent 404 if they are wrong.
   *
   * Nothing expected here reaches a 5xx, which `MiddlewareFactory.error()` would
   * forward to Sentry: a malformed body is a 400, an unknown agent a 404, a
   * read-only session a 403, and a turn that outruns its timeout a **202** — it is
   * still running, and the conversation poll will show it land.
   */
  router.post('/kagent/sessions/:sessionId/messages', async (req, res) => {
    const { client } = resolveInstallation(req);

    const body = (req.body ?? {}) as Record<string, unknown>;

    const agentNamespace = readRequiredString(body, 'agentNamespace');
    const agentName = readRequiredString(body, 'agentName');
    const messageId = readRequiredString(body, 'messageId');

    // The one field not trimmed to its bounds check: leading and trailing
    // whitespace is insignificant for a prompt, but interior formatting is not,
    // so only the ends go. Checked after trimming so a message of pure
    // whitespace is rejected rather than sent as an empty turn.
    const rawText = body.text;
    if (typeof rawText !== 'string') {
      throw new InputError('text must be a string');
    }
    const text = rawText.trim();
    if (!text) {
      throw new InputError('text must not be empty');
    }
    if (text.length > MESSAGE_TEXT_MAX_LENGTH) {
      throw new InputError(
        `text must be at most ${MESSAGE_TEXT_MAX_LENGTH} characters`,
      );
    }

    try {
      const result = await client.sendMessage(
        readSessionId(req),
        { namespace: agentNamespace, name: agentName },
        { messageId, text },
        { userToken: readUserToken(req, { required: true }) },
      );
      res.json(result);
    } catch (error) {
      if (!isTurnPendingError(error)) {
        throw error;
      }
      // Accepted, not finished. The caller stops waiting and reads the outcome
      // from the conversation poll like any other progress.
      logger.debug(
        'A kagent turn outlived its timeout; answering 202 and leaving it running',
        { turnTimeoutMs },
      );
      res.status(202).json({ status: 'pending' });
    }
  });

  // There is no version route. kagent serves `/version` at the server root, and
  // neither supported door proxies the root to the controller — the derived
  // door's nginx sends `/` to the kagent UI, and the agentgateway override only
  // matches the `/kagent` prefix. See the comment in KagentClient for details.

  /**
   * Identity probe. Diagnoses the two ways a correct-looking sessions list can
   * be wrong: a `sub` that differs from the one kagent recorded (empty list),
   * and a controller running in `unsecure` mode (shared list).
   */
  /**
   * Answer the confirmation a session is suspended on.
   *
   * Separate from the messages route because it is a different act, not a variant
   * of one: this resumes a named task, and getting that wrong strands the agent
   * rather than merely failing. Folding it into `POST …/messages` would have made
   * `taskId` an optional field there, and an optional field that silently changes
   * a reply into a resume is the wrong shape for something this consequential.
   *
   * `answers` is positional — one entry per question, in the order asked — and each
   * entry is a list even for a single-select. The frontend derives it from the same
   * `questions` array it rendered, so the ordering is the one kagent asked in.
   *
   * The token is **required**, like every other write: kagent decides whose session
   * this is from it alone.
   *
   * Nothing expected reaches a 5xx — `MiddlewareFactory.error()` forwards anything
   * `>= 500` to Sentry. A malformed body is a 400, a task kagent will not resume is
   * a 409, and a turn that outlives its transport is a 202.
   */
  router.post('/kagent/sessions/:sessionId/answer', async (req, res) => {
    const { client } = resolveInstallation(req);

    const body = (req.body ?? {}) as Record<string, unknown>;
    const agentNamespace = readRequiredString(body, 'agentNamespace');
    const agentName = readRequiredString(body, 'agentName');
    const messageId = readRequiredString(body, 'messageId');
    const taskId = readRequiredString(body, 'taskId');

    const rawDecision = body.decision;
    if (rawDecision !== 'approve' && rawDecision !== 'reject') {
      throw new InputError("decision must be 'approve' or 'reject'");
    }

    // Positional and nested, so it needs its own check rather than
    // `readRequiredString`: a malformed answer would otherwise reach kagent as a
    // decision with no answers, which it accepts — resuming the task with the
    // question silently unanswered.
    let answers: string[][] | undefined;
    if (body.answers !== undefined) {
      if (!Array.isArray(body.answers)) {
        throw new InputError('answers must be an array');
      }
      answers = body.answers.map(entry => {
        if (!Array.isArray(entry)) {
          throw new InputError('each answer must be an array of strings');
        }
        return entry.map(value => {
          if (typeof value !== 'string') {
            throw new InputError('each answer must be an array of strings');
          }
          return value;
        });
      });
    }

    const readOptionalBounded = (field: string): string | undefined => {
      const value = body[field];
      if (value === undefined) {
        return undefined;
      }
      if (typeof value !== 'string') {
        throw new InputError(`${field} must be a string`);
      }
      const trimmed = value.trim();
      if (!trimmed) {
        return undefined;
      }
      if (trimmed.length > MESSAGE_TEXT_MAX_LENGTH) {
        throw new InputError(
          `${field} must be at most ${MESSAGE_TEXT_MAX_LENGTH} characters`,
        );
      }
      return trimmed;
    };

    try {
      const result = await client.answerConfirmation(
        readSessionId(req),
        { namespace: agentNamespace, name: agentName },
        {
          messageId,
          taskId,
          decision: rawDecision,
          answers,
          rejectionReason: readOptionalBounded('rejectionReason'),
          text: readOptionalBounded('text'),
        },
        { userToken: readUserToken(req, { required: true }) },
      );
      res.json(result);
    } catch (error) {
      // Same contract as the messages route: a turn still running is a 202, not a
      // failure. The answer has been accepted by then; only the agent's reply is
      // outstanding.
      if (!isTurnPendingError(error)) {
        throw error;
      }
      res.status(202).json({ status: 'pending' });
    }
  });

  router.get('/kagent/me', async (req, res) => {
    const { client } = resolveInstallation(req);
    const result = await client.getMe({
      userToken: readUserToken(req, { required: false }),
    });
    res.json(result);
  });

  return router;
}
