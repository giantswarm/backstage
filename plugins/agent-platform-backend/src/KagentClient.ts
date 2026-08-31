import { LoggerService } from '@backstage/backend-plugin-api';
import { Config } from '@backstage/config';
import {
  AuthenticationError,
  ConflictError,
  NotAllowedError,
  NotFoundError,
} from '@backstage/errors';

/**
 * Header the agent-platform frontend uses to forward the user's
 * per-installation Dex OIDC ID token, which this proxy sets as
 * `Authorization: Bearer` toward kagent.
 *
 * Mirrors muster's `backstage-muster-authorization`: kept off `Authorization`
 * because that header carries the Backstage identity on the inbound leg.
 *
 * Must match KAGENT_AUTH_HEADER in plugins/agent-platform.
 */
export const KAGENT_AUTH_HEADER = 'backstage-kagent-authorization';

/** Default per-request timeout toward a kagent API. */
export const DEFAULT_KAGENT_TIMEOUT_MS = 10_000;

/**
 * Timeout for one A2A turn, which is a different order of magnitude from every
 * other call here.
 *
 * `message/send` answers only once the agent has finished — a turn with many tool
 * calls routinely runs minutes — so the 10 s read timeout would abort every
 * non-trivial one. 5 minutes matches `ACTIVE_MAX_AGE_MS` in the frontend's
 * polling, which is calibrated to the same thing.
 *
 * **A gateway in front of kagent usually gives up first**, so this is a backstop
 * rather than the operative bound: gazelle's `agent-platform-connectivity-ui`
 * route carries an Envoy `BackendTrafficPolicy` with `requestTimeout: 60s`, which
 * no turn of any substance survives. That is handled, not avoided — see
 * {@link KagentClient.sendMessage}.
 *
 * Exceeding it is not a failure: see {@link turnPendingError}.
 */
export const DEFAULT_KAGENT_TURN_TIMEOUT_MS = 5 * 60_000;

/**
 * Longest session name this proxy will store.
 *
 * kagent imposes no limit of its own — `session.name` is Postgres `TEXT`
 * (`go/core/pkg/migrations/core/000001_initial.up.sql`) and no handler validates
 * it — so this bound is ours, chosen to match the conversation titles in the
 * ai-chat plugin. Enforced here as well as in the dialog, because a client-side
 * `maxLength` is a nicety and not a guard.
 *
 * Reads stay unbounded: a longer name set by kagent's own UI must still render.
 *
 * Must match SESSION_NAME_MAX_LENGTH in plugins/agent-platform.
 */
export const SESSION_NAME_MAX_LENGTH = 255;

/**
 * Longest message this proxy will forward to an agent.
 *
 * Ours, not kagent's — nothing upstream validates the text. Generous on purpose,
 * because pasting logs or a manifest into a prompt is a normal thing to do; it
 * exists to keep an absurd payload from becoming an agent's whole context window.
 *
 * Counts UTF-16 code units (JavaScript's `String.length`), so a character
 * outside the BMP costs two. The router raises its JSON body limit to keep this
 * the bound a caller actually meets, rather than the body parser's.
 *
 * Must match MESSAGE_TEXT_MAX_LENGTH in plugins/agent-platform.
 */
export const MESSAGE_TEXT_MAX_LENGTH = 32_000;

/** One installation's kagent endpoint. */
export interface KagentInstallationConfig {
  /** Installation name, as in `gs.installations`. */
  name: string;
  /**
   * kagent API base URL, no trailing slash — e.g.
   * `https://kagent.<baseDomain>/api`.
   */
  apiBaseUrl: string;
}

export interface KagentRequestOptions {
  /**
   * The user's Dex ID token, forwarded as `Authorization: Bearer` toward
   * kagent. Optional because `/version` and `/me` are useful even when no
   * token could be minted; `/sessions` requires one.
   */
  userToken?: string;
}

/**
 * Per-endpoint wording for a 404, so the message a user reads matches what
 * actually went wrong.
 *
 * Without this every 404 reports "The kagent API is not available for
 * installation X", which is an outage claim — badly wrong for the common case of
 * a bookmarked link to a session that has since been deleted.
 */
interface NotFoundContext {
  /**
   * What a 404 means when **kagent's own handler** answered it: the endpoint
   * exists, the resource does not.
   */
  missingResource: string;
  /**
   * Short name of the endpoint, used when the **route itself** is absent — an
   * older kagent that predates it.
   */
  endpoint: string;
}

/**
 * Derive the kagent API base URL for an installation from its base domain.
 *
 * The hostname pattern matches the `agent-platform-connectivity` chart's
 * `kagent.uiRoute.hostname` (`kagent.<codename>.<base>`), which is exactly
 * `kagent.<baseDomain>` — the same derivation `useAgentAvatarUrl` uses for
 * `avatars.<baseDomain>`. That host is fronted by oauth2-proxy, whose nginx
 * sidecar proxies `/api/` to `kagent-controller:8083`.
 *
 * Returns undefined when the installation has no `baseDomain`.
 */
export function deriveKagentApiBaseUrl(
  baseDomain: string | undefined,
): string | undefined {
  if (!baseDomain) {
    return undefined;
  }
  return `https://kagent.${baseDomain}/api`;
}

/** Strip trailing slashes so URL joining stays predictable. */
function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

/**
 * kagent answered (or was reachable) and then failed: a 5xx, a 429, a timeout, or
 * a body that could not be read.
 *
 * Deliberately **not** the same error as "kagent is absent". That case is a 404
 * (see the catch block in `request`): silenced by the frontend, and below the
 * `>= 500` threshold at which `MiddlewareFactory.error()` logs to Sentry, which
 * matters because it is the expected outcome on most installations.
 *
 * This one surfaces as a 500, so the frontend reports it *and* it reaches Sentry —
 * both correct here. A deployed-but-degraded kagent is rare and genuinely
 * actionable, and its sessions silently vanishing from the fleet-merged list would
 * be the worse failure.
 */
function upstreamError(message: string): Error {
  const error = new Error(message);
  error.name = 'UpstreamError';
  return error;
}

/**
 * Name of the error thrown for a kagent 400, for the one caller that opts into
 * seeing them.
 *
 * Name-based rather than a subclass, matching {@link upstreamError} — nothing
 * crosses a package boundary with it, and `instanceof` buys nothing here.
 */
const BAD_REQUEST_ERROR_NAME = 'KagentBadRequestError';

/**
 * kagent rejected the request itself.
 *
 * Only thrown when a caller passes `badRequest: true`, because for every other
 * endpoint a 400 is a coding error on our side and belongs on the generic
 * upstream-failure path. {@link KagentClient.updateSessionName} opts in because
 * there a 400 is *diagnostic*: it is how a kagent too old to rename announces
 * itself. See that method.
 */
function badRequestError(message: string): Error {
  const error = new Error(message);
  error.name = BAD_REQUEST_ERROR_NAME;
  return error;
}

function isBadRequestError(error: unknown): boolean {
  return (error as Error | undefined)?.name === BAD_REQUEST_ERROR_NAME;
}

/** Name of the error thrown when an A2A turn outlives its timeout. */
export const TURN_PENDING_ERROR_NAME = 'KagentTurnPendingError';

/**
 * The turn was dispatched and is still running.
 *
 * Deliberately not an upstream failure. `message/send` holds the connection until
 * the agent finishes, so losing that connection — to our own timeout, or to the
 * gateway's 60 s one — says "nobody waited long enough", not "broken". The turn is
 * already recorded against the session, which is what
 * {@link KagentClient.sendMessage} confirms before reporting this, and the
 * conversation poll will show it progress and finish.
 *
 * The router turns this into a 202 rather than a 5xx, which
 * `MiddlewareFactory.error()` would forward to Sentry: one issue per long turn,
 * for the thing an agent is supposed to do.
 */
function turnPendingError(message: string): Error {
  const error = new Error(message);
  error.name = TURN_PENDING_ERROR_NAME;
  return error;
}

export function isTurnPendingError(error: unknown): boolean {
  return (error as Error | undefined)?.name === TURN_PENDING_ERROR_NAME;
}

function isUpstreamError(error: unknown): boolean {
  return (error as Error | undefined)?.name === 'UpstreamError';
}

/**
 * Whether any task in a `GET /sessions/<id>/tasks` payload holds this message.
 *
 * Walked defensively rather than parsed: the only question asked of it is
 * "is this id in there", and a payload shape we do not recognise should answer
 * "cannot tell" — i.e. false — not throw.
 */
function payloadHasMessageId(payload: unknown, messageId: string): boolean {
  const tasks = (payload as { data?: unknown })?.data ?? payload;
  if (!Array.isArray(tasks)) {
    return false;
  }
  return tasks.some(task => {
    const history = (task as { history?: unknown })?.history;
    if (!Array.isArray(history)) {
      return false;
    }
    return history.some(
      entry => (entry as { messageId?: unknown })?.messageId === messageId,
    );
  });
}

/** Whether a configured URL is absolute and http(s), so `fetch` can use it. */
function isAbsoluteHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Resolve the installations this proxy can target, keyed by name.
 *
 * `agentPlatform.kagent.installations`, when present, acts as the allowlist and
 * each entry's `apiBaseUrl` overrides the derived URL. When absent, every
 * `gs.installations` entry with a `baseDomain` is derived — kagent is only
 * deployed on some installations, and the ones without it simply fail per
 * request and are reported as "not installed".
 *
 * Installations that resolve to no URL are logged once at init and omitted.
 */
export function readKagentInstallationsFromConfig(
  config: Config,
  logger: LoggerService,
): Map<string, KagentInstallationConfig> {
  const result = new Map<string, KagentInstallationConfig>();

  const gsInstallations = config.getOptionalConfig('gs.installations');
  const baseDomains = new Map<string, string | undefined>();
  for (const name of gsInstallations?.keys() ?? []) {
    baseDomains.set(
      name,
      gsInstallations?.getOptionalString(`${name}.baseDomain`),
    );
  }

  const overrides = config.getOptionalConfig(
    'agentPlatform.kagent.installations',
  );
  // The explicit block is the allowlist when present; otherwise fan out to the
  // whole configured fleet.
  const names = overrides ? overrides.keys() : [...baseDomains.keys()];

  for (const name of names) {
    const explicitUrl = overrides?.getOptionalString(`${name}.apiBaseUrl`);
    const apiBaseUrl =
      explicitUrl ?? deriveKagentApiBaseUrl(baseDomains.get(name));

    if (!apiBaseUrl) {
      logger.info(
        `Skipping kagent proxy for installation '${name}': no apiBaseUrl configured and no baseDomain to derive one from.`,
      );
      continue;
    }

    // Reject a non-absolute URL here rather than letting it fail per request:
    // an operator omitting the scheme would otherwise surface as an opaque
    // fetch failure on every call instead of one clear message at startup.
    if (!isAbsoluteHttpUrl(apiBaseUrl)) {
      logger.warn(
        `Skipping kagent proxy for installation '${name}': apiBaseUrl must be an absolute http(s) URL.`,
        { apiBaseUrl },
      );
      continue;
    }

    result.set(name, {
      name,
      apiBaseUrl: stripTrailingSlash(apiBaseUrl),
    });
  }

  return result;
}

/**
 * Thin HTTP client for one installation's kagent REST API.
 *
 * Deliberately a byte-for-byte proxy: it returns kagent's JSON verbatim,
 * without unwrapping the `{error, data, message}` envelope, stripping unknown
 * fields, or filtering anything. Schema tolerance lives in the frontend, so a
 * kagent schema change never requires a backend release. The split is:
 * backend = transport, frontend = schema.
 */
export class KagentClient {
  constructor(
    private readonly installation: KagentInstallationConfig,
    private readonly logger: LoggerService,
    /** Overridable for tests; defaults to the global fetch. */
    private readonly fetchFn: typeof fetch = fetch,
    private readonly timeoutMs: number = DEFAULT_KAGENT_TIMEOUT_MS,
    /** Separate budget for {@link sendMessage}, which waits out a whole turn. */
    private readonly turnTimeoutMs: number = DEFAULT_KAGENT_TURN_TIMEOUT_MS,
  ) {}

  /** `GET <apiBaseUrl>/sessions` — the user's sessions, kagent's JSON verbatim. */
  async listSessions(options: KagentRequestOptions): Promise<unknown> {
    return this.request(`${this.installation.apiBaseUrl}/sessions`, options);
  }

  /**
   * `GET <apiBaseUrl>/sessions/<id>` — the session object.
   *
   * kagent scopes this by the forwarded token's user id, so a session belonging
   * to somebody else is indistinguishable from one that does not exist: both
   * answer 404. That is an expected outcome for a stale or shared deep link, and
   * `request` already maps it to `NotFoundError` (404) rather than a 5xx.
   *
   * The conversation comes from {@link listSessionTasks}, not from this response's
   * `events` array — which is ignored entirely, hence the `limit=1` below.
   */
  async getSession(
    sessionId: string,
    options: KagentRequestOptions,
  ): Promise<unknown> {
    return this.request(
      // `limit=1` — **not** `limit=0`, which kagent reads as *unlimited*: its DB
      // layer gates the LIMIT clause on `opts.Limit > 0`
      // (`go/core/internal/database/client_postgres.go`), and an absent param
      // leaves `Limit` at its zero value. So `1` is the smallest value that limits
      // anything, and "ask for zero events, we don't read them" — the
      // obvious-looking simplification — silently restores the full payload.
      //
      // The caller wants the session object and nothing else. kagent bundles the
      // session's stored events into this response and they dominate it — on a real
      // 4-turn session, 591 KB of events against 261 bytes of session metadata.
      // They are not the conversation (that comes from `/tasks`) and, despite
      // kagent's Go doc comment, not A2A messages either, so there is nothing in
      // them we can use.
      //
      // Both v0.9.9 and v0.10 honour `limit` on this endpoint — v0.9.9 parses it
      // inline in `HandleGetSession`, v0.10 in `eventQueryOptionsFromRequest`. A
      // version that ignored it would simply return everything, which is exactly
      // today's behaviour — so this can only help.
      `${this.installation.apiBaseUrl}/sessions/${encodeURIComponent(
        sessionId,
      )}?limit=1`,
      options,
      {
        notFound: {
          // The id is left out on purpose: it is opaque and high-cardinality, and
          // the user already has it in the URL they followed.
          missingResource: `That session does not exist on installation '${this.installation.name}'. It may have been deleted, or it may belong to another user.`,
          endpoint: 'session detail',
        },
      },
    );
  }

  /**
   * `GET <apiBaseUrl>/sessions/<id>/tasks` — the session's A2A tasks, which
   * carry the conversation (`history`), its state (`status.state`) and per-message
   * token usage. This is the same endpoint kagent's own UI renders its chat from.
   *
   * Deliberately sends no `A2A-Version` header: kagent's `NegotiateA2AWireVersion`
   * treats a missing header as the legacy v0 wire on both v0.9.9 and v0.10, which
   * is the shape kagent's UI consumes and therefore the best-tested one. Opting
   * into the v1 wire is a future, deliberate migration.
   */
  async listSessionTasks(
    sessionId: string,
    options: KagentRequestOptions,
  ): Promise<unknown> {
    return this.request(
      `${this.installation.apiBaseUrl}/sessions/${encodeURIComponent(
        sessionId,
      )}/tasks`,
      options,
      {
        notFound: {
          missingResource: `That session does not exist on installation '${this.installation.name}'. It may have been deleted, or it may belong to another user.`,
          endpoint: 'session tasks',
        },
      },
    );
  }

  /**
   * Send one message to an agent, as a turn of an existing session.
   *
   * `POST <apiBaseUrl>/a2a/<namespace>/<name>`, A2A JSON-RPC `message/send`, with
   * `contextId` set to the session id — which is the *only* thing tying the turn
   * to the session. Sessions themselves hold history but cannot send anything, so
   * this is a different endpoint family from every other method here.
   *
   * **The agent's namespace and name are passed in, never derived from the
   * session's `agent_id`.** That id is kagent's "python identifier" encoding,
   * which rewrites every `-` to `_`; decoding it cannot tell an original `_` from
   * a rewritten `-`, so a name containing an underscore would resolve to an agent
   * that does not exist. The caller knows the real names from the `Agent`
   * resource and sends those.
   *
   * Two behaviours worth knowing, both observed against v0.9.9 on gazelle:
   *
   * - **It answers with the finished task**, not an acknowledgement:
   *   `result.kind === 'task'`, carrying `status.state` and the full `history`.
   *   Waiting that out is usually impossible — see the gateway note below — so a
   *   transport failure is verified against the session's history rather than
   *   reported as a failed message.
   * - **A failed turn is still a 200.** The JSON-RPC result carries
   *   `status.state === 'failed'` and a readable reason on `status.message` (an
   *   agent that cannot reach its MCP server reports it there). So the HTTP status
   *   says only whether the turn was accepted; the caller reads the task for what
   *   became of it.
   *
   * Sends no `A2A-Version` header, matching `listSessionTasks` deliberately — the
   * write and the reads must agree on a wire version or the states will not line
   * up. TODO(kagent-0.11): the legacy v0 wire is marked for removal there, at
   * which point both need pinning together.
   */
  async sendMessage(
    sessionId: string,
    agent: { namespace: string; name: string },
    message: { messageId: string; text: string },
    options: KagentRequestOptions,
  ): Promise<unknown> {
    try {
      return await this.postMessage(sessionId, agent, message, options);
    } catch (error) {
      // A transport failure is not a failed message. The gateway in front of
      // kagent cuts the request off long before an agent is done — 60 s on
      // gazelle's `agent-platform-connectivity-ui` route, against turns that run
      // minutes — and the turn keeps running regardless: verified on gazelle,
      // where the agent answered a message whose own request had already died
      // with a 502.
      //
      // So the only honest way to report this is to go and look. If the message
      // reached the session's history, it was dispatched and the conversation
      // poll will show it finish; if it did not, the failure was real.
      if (!isUpstreamError(error) && !isTurnPendingError(error)) {
        throw error;
      }

      if (
        !(await this.hasMessageLanded(sessionId, message.messageId, options))
      ) {
        throw error;
      }

      this.logger.debug(
        `A kagent turn outlived its transport on installation '${this.installation.name}'; the message was dispatched and is still running`,
      );
      throw turnPendingError(
        `The agent on installation '${this.installation.name}' is still working on the message; the connection closed before it finished.`,
      );
    }
  }

  /**
   * Whether a message we sent is in the session's history.
   *
   * Only asked after the send's transport failed, so there has been ample time
   * for kagent to have written it — and a read failure here answers "cannot
   * tell", which keeps the original error rather than inventing a second one.
   */
  private async hasMessageLanded(
    sessionId: string,
    messageId: string,
    options: KagentRequestOptions,
  ): Promise<boolean> {
    try {
      const payload = await this.listSessionTasks(sessionId, options);
      return payloadHasMessageId(payload, messageId);
    } catch (error) {
      this.logger.debug(
        `Could not confirm whether a message reached installation '${this.installation.name}'`,
        { error: String(error) },
      );
      return false;
    }
  }

  private async postMessage(
    sessionId: string,
    agent: { namespace: string; name: string },
    message: { messageId: string; text: string },
    options: KagentRequestOptions,
  ): Promise<unknown> {
    return this.request(
      `${this.installation.apiBaseUrl}/a2a/${encodeURIComponent(
        agent.namespace,
      )}/${encodeURIComponent(agent.name)}`,
      options,
      {
        method: 'POST',
        body: {
          jsonrpc: '2.0',
          // The JSON-RPC correlation id. Reusing the message id keeps a single
          // identifier across our logs, kagent's, and the stored history.
          id: message.messageId,
          method: 'message/send',
          params: {
            message: {
              kind: 'message',
              messageId: message.messageId,
              role: 'user',
              parts: [{ kind: 'text', text: message.text }],
              contextId: sessionId,
            },
          },
        },
        timeoutMs: this.turnTimeoutMs,
        timeoutIsPending: true,
        notFound: {
          missingResource: `Agent '${agent.namespace}/${agent.name}' does not exist on installation '${this.installation.name}'.`,
          endpoint: 'agent messaging',
        },
      },
    );
  }

  /**
   * `DELETE <apiBaseUrl>/sessions/<id>` — kagent's session delete.
   *
   * Scoped to the forwarded token's user, and **soft**: kagent sets `deleted_at`
   * on the row (`UPDATE session SET deleted_at = NOW() WHERE id = $1 AND
   * user_id = $2`) and every read filters `deleted_at IS NULL`, so the session and
   * its events stay in the database while disappearing from the API.
   *
   * Identical on v0.9.9 and v0.10, including two things worth knowing:
   *
   * - **Deleting something that is not there succeeds.** The statement is an
   *   `:exec`, so zero affected rows is not an error — a session that never
   *   existed, was already deleted, or belongs to another user all answer 200.
   *   There is no 404 to handle here, and no "already gone" case to special-case.
   * - **The response is a 200 with kagent's usual JSON envelope**, not a 204.
   *
   * Returned verbatim like every other response: this client is transport only.
   */
  async deleteSession(
    sessionId: string,
    options: KagentRequestOptions,
  ): Promise<unknown> {
    return this.request(
      `${this.installation.apiBaseUrl}/sessions/${encodeURIComponent(
        sessionId,
      )}`,
      options,
      {
        method: 'DELETE',
        notFound: {
          // Only reachable for a `text/plain` 404, i.e. no such route — kagent's
          // own handler never 404s here (see above). The route has existed since
          // v0.9.x, so this wording is purely defensive.
          missingResource: `That session does not exist on installation '${this.installation.name}'.`,
          endpoint: 'session delete',
        },
      },
    );
  }

  /**
   * Rename one session, across two incompatible kagent generations.
   *
   * The endpoint meant for this is `PUT <apiBaseUrl>/sessions/<id>` with
   * `{name}`, and on **v0.10+** that is all this does.
   *
   * On **v0.9.x it cannot rename at all**, which is not obvious and is worth
   * stating precisely, because the docs and the route table both suggest
   * otherwise. `HandleUpdateSession` there
   * (`go/core/internal/httpserver/handlers/sessions.go`):
   *
   * - requires `name` *and* `agent_ref`, rejecting either omission with a 400;
   * - never reads the `{session_id}` path param — it looks the session up by
   *   `*sessionRequest.Name`, i.e. it treats the new name as the id;
   * - assigns only `session.AgentID`. `session.Name` is never written.
   *
   * So the fallback below goes through `POST <apiBaseUrl>/sessions` instead,
   * whose `StoreSession` is an upsert on `(id, user_id)` that does write `name`.
   * The SQL is identical in v0.9.9 and v0.10.0-rc1
   * (`go/core/internal/database/queries/sessions.sql`), and echoing the
   * session's own `agent_id` back as `agent_ref` round-trips exactly, because
   * kagent's `ConvertToPythonIdentifier` only rewrites `-` and `/` — neither of
   * which survives in an already-encoded id, making it idempotent.
   *
   * **Only a 400 enters the fallback**, and it means "this kagent predates the
   * fix" — nothing more. It is tempting to read the PUT's status as also telling
   * us whether the session exists; it does not. v0.9.x rejects the missing
   * `agent_ref` *before* it looks anything up, so a live session and a deleted
   * one both answer 400, and the 404 that would distinguish them is reachable
   * only on v0.10+ — which is to say, never on today's fleet.
   *
   * **So the read-back below, not the status, is what enforces "never create".**
   * The upsert inserts when nothing conflicts, so without that read a rename of
   * an already-deleted session would resurrect it under its old id. See
   * {@link getSessionRecord}.
   *
   * Every way the fallback can fail, it fails before writing, and each is a 4xx
   * rather than an upstream failure: the session is gone (404), it has no agent
   * (409), kagent cannot resolve that agent (409), or a sandbox-workload agent
   * already holds a session (409). None of these are faults anyone can act on,
   * and on a fleet where every installation takes this branch a 5xx would mean a
   * standing Sentry issue for each.
   *
   * TODO(kagent-0.9): delete the fallback — the POST branch, the read-back, the
   * `badRequest`/`conflict` opt-ins, and their tests — once no installation runs
   * kagent v0.9.x. The PUT alone is then correct.
   */
  async updateSessionName(
    sessionId: string,
    name: string,
    options: KagentRequestOptions,
  ): Promise<unknown> {
    const notFound: NotFoundContext = {
      missingResource: `That session does not exist on installation '${this.installation.name}'. It may have been deleted, or it may belong to another user.`,
      endpoint: 'session update',
    };

    try {
      return await this.request(
        `${this.installation.apiBaseUrl}/sessions/${encodeURIComponent(
          sessionId,
        )}`,
        options,
        { method: 'PUT', body: { name }, badRequest: true, notFound },
      );
    } catch (error) {
      if (!isBadRequestError(error)) {
        throw error;
      }
    }

    // TODO(kagent-0.9): remove from here to the end of the method.
    this.logger.debug(
      `kagent rejected the session rename on installation '${this.installation.name}'; retrying via the session upsert`,
    );

    // Read the session back before writing, and this is **not** an optimisation
    // to skip.
    //
    // The PUT's 400 says nothing about whether the session exists. v0.9.x
    // validates `agent_ref` before it looks anything up, so a request without one
    // is rejected identically for a live session and a deleted one — there is no
    // 404 to distinguish them on the only versions that ever reach this branch.
    // Since the upsert below *inserts* when nothing conflicts, going straight to
    // it would resurrect a session someone had just deleted, under its old id.
    // This read is what actually enforces "never create", and the 404 handling on
    // the PUT is only load-bearing on v0.10+.
    //
    // It also makes the echoed fields authoritative. `agent_id` and `source` are
    // overwritten by the upsert from whatever we send, so they have to be the
    // session's own — taking them from kagent here rather than from the browser
    // means a stale, unparsed or simply absent client value cannot silently blank
    // a column the user never asked to touch.
    const existing = await this.getSessionRecord(sessionId, options, notFound);

    const agentRef = existing.agent_id;
    if (!agentRef) {
      // Expected, not a fault: `agent_id` is nullable, and kagent needs an
      // `agent_ref` to accept the upsert. A 409 keeps this off the >= 500 path
      // that `MiddlewareFactory.error()` forwards to Sentry — on a fleet where
      // every installation takes this branch, a 5xx here would be a recurring
      // issue for something nobody can act on.
      throw new ConflictError(
        `This session cannot be renamed on installation '${this.installation.name}': its kagent version renames through the session record, which requires an agent, and this session has none.`,
      );
    }

    try {
      return await this.request(
        `${this.installation.apiBaseUrl}/sessions`,
        options,
        {
          method: 'POST',
          body: {
            id: sessionId,
            name,
            agent_ref: agentRef,
            ...(existing.source && { source: existing.source }),
          },
          badRequest: true,
          conflict: true,
          notFound,
        },
      );
    } catch (error) {
      // Both are expected outcomes of the workaround rather than kagent being
      // unwell: a 400 means kagent could not resolve the agent the session
      // itself names, and a 409 means a sandbox-workload agent already holds a
      // session. Neither is a 5xx, for the same Sentry reason as above.
      if (isBadRequestError(error)) {
        throw new ConflictError(
          `This session cannot be renamed on installation '${this.installation.name}': kagent did not accept its own agent reference.`,
        );
      }
      throw error;
    }
  }

  /**
   * One session's record, for the rename workaround.
   *
   * Deliberately the only place this client looks inside kagent's envelope — it
   * is transport everywhere else, and schema handling belongs in the frontend.
   * The exception is contained: the fields are read to be handed straight back to
   * kagent, never to the caller, and this goes away with the workaround.
   *
   * TODO(kagent-0.9): remove with {@link updateSessionName}'s fallback.
   */
  private async getSessionRecord(
    sessionId: string,
    options: KagentRequestOptions,
    notFound: NotFoundContext,
  ): Promise<{ agent_id?: string; source?: string }> {
    // `limit=1` for the same reason as `getSession`: the events dominate this
    // payload and nothing here reads them. Not `limit=0`, which kagent treats as
    // unlimited.
    const body = await this.request(
      `${this.installation.apiBaseUrl}/sessions/${encodeURIComponent(
        sessionId,
      )}?limit=1`,
      options,
      { notFound },
    );

    const session = (body as { data?: { session?: unknown } } | undefined)?.data
      ?.session as { agent_id?: string; source?: string } | undefined;

    // A readable 200 that carried no session is the same condition as a 404 —
    // kagent scopes the lookup by user id, so a deleted session and someone
    // else's are already indistinguishable. Must stay a throw: falling through
    // would put us back to upserting a session that is not there.
    if (!session) {
      throw new NotFoundError(notFound.missingResource);
    }

    return session;
  }

  // There is deliberately no version probe. kagent serves `/version` at the
  // server root (`APIPathVersion`), not under `/api`, and neither door we
  // support routes the root to the controller:
  //
  // - The derived door's nginx sidecar (`helm/kagent/files/nginx.conf`) proxies
  //   only `location /api/` to `kagent-controller:8083`; `location /` goes to
  //   the kagent UI, which answers with HTML — which our non-JSON guard would
  //   then report as a sign-in page on a perfectly healthy installation.
  // - The agentgateway override matches on the `/kagent` path prefix, so a
  //   root-relative `/version` does not match its HTTPRoute at all.
  //
  // Nothing under `/api` exposes the controller version either (the `Version`
  // fields in `/api/substrate/status` are per-actor, not the controller's), so
  // there is nothing reachable to probe. Version *tolerance* does not depend on
  // this — it lives in the frontend's permissive parsing. If a future feature
  // needs version gating, probe by behaviour (call a version-specific endpoint
  // and treat 404 as "absent") rather than by version string.

  /**
   * `GET <apiBaseUrl>/me` — the identity kagent resolved for the forwarded
   * token. Used to detect the controller's auth mode: under `trusted-proxy` it
   * reflects the caller's claims, while under `unsecure` kagent ignores the
   * token and falls back to a shared default user.
   */
  async getMe(options: KagentRequestOptions): Promise<unknown> {
    return this.request(`${this.installation.apiBaseUrl}/me`, options);
  }

  private async request(
    url: string,
    options: KagentRequestOptions,
    extra: {
      /** Defaults to GET; the reads leave it out. */
      method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
      /** JSON request body. Adds the matching `Content-Type` when present. */
      body?: unknown;
      /**
       * Surface a kagent 400 as {@link badRequestError} instead of folding it
       * into the generic upstream failure. Opt-in, so no existing endpoint
       * changes behaviour.
       */
      badRequest?: boolean;
      /**
       * Surface a kagent 409 as `ConflictError` rather than as an upstream
       * failure. Opt-in, like {@link badRequest}.
       */
      conflict?: boolean;
      /** Overrides the client's read timeout. Only {@link sendMessage} needs this. */
      timeoutMs?: number;
      /**
       * Report a timeout as {@link turnPendingError} rather than an upstream
       * failure, for a call whose work continues after we stop waiting.
       */
      timeoutIsPending?: boolean;
      notFound?: NotFoundContext;
    } = {},
  ): Promise<unknown> {
    const {
      method = 'GET',
      body,
      badRequest,
      conflict,
      timeoutIsPending,
      notFound,
    } = extra;
    const timeoutMs = extra.timeoutMs ?? this.timeoutMs;

    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method,
        headers: {
          Accept: 'application/json',
          ...(body !== undefined && { 'Content-Type': 'application/json' }),
          ...(options.userToken && {
            Authorization: `Bearer ${options.userToken}`,
          }),
        },
        ...(body !== undefined && { body: JSON.stringify(body) }),
        // Do NOT follow oauth2-proxy's redirect into Dex: a 3xx here means the
        // forwarded token was not accepted, and following it would yield an
        // HTML sign-in page with a 200.
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      // A timeout means something *is* listening but did not answer in time —
      // kagent is deployed and unwell, not absent. That must not be swallowed as
      // "no kagent here", so it becomes an upstream failure the frontend
      // surfaces. `AbortSignal.timeout` rejects with a TimeoutError.
      if ((error as Error)?.name === 'TimeoutError') {
        this.logger.debug(
          `kagent request timed out for installation '${this.installation.name}'`,
          { timeoutMs },
        );
        // A turn that outlasts its budget is still running upstream, so it is not
        // reported as a failure. See `turnPendingError`.
        if (timeoutIsPending) {
          throw turnPendingError(
            `The agent on installation '${this.installation.name}' has not finished within ${timeoutMs}ms; the turn is still running.`,
          );
        }
        throw upstreamError(
          `The kagent API for installation '${this.installation.name}' did not respond within ${timeoutMs}ms.`,
        );
      }

      // DNS failure, TLS error or connection refused: nothing is reachable at
      // that host, i.e. kagent is not deployed on this installation. On a fleet
      // where only a couple of installations run kagent, this is the *normal,
      // expected* outcome for most of them on every page view.
      //
      // It must therefore be a 404 and not a 503. `MiddlewareFactory.error()`
      // logs `logger.error` for any status >= 500, and the root logger forwards
      // warn/error to Sentry — so a 503 here would raise one Sentry event per
      // kagent-less installation per page view, per user, fanned out into a
      // separate issue per installation name. Logging the cause at debug does
      // not prevent that; only not throwing a 5xx does.
      //
      // 404 also matches what the frontend already does with kagent's own 404:
      // treat it as "no kagent API here" and stay silent. The two cases carried
      // no distinguishable meaning, so collapsing them loses nothing.
      this.logger.debug(
        `kagent is not reachable for installation '${this.installation.name}'`,
        { error: String(error) },
      );
      throw new NotFoundError(
        `The kagent API is not available for installation '${this.installation.name}'.`,
      );
    }

    if (response.status >= 300 && response.status < 400) {
      throw new AuthenticationError(
        `The kagent API for installation '${this.installation.name}' redirected to a sign-in page; the forwarded token was not accepted.`,
      );
    }

    if (response.status === 401) {
      throw new AuthenticationError(
        `Not authenticated against the kagent API for installation '${this.installation.name}'.`,
      );
    }

    if (response.status === 403) {
      throw new NotAllowedError(
        `Not authorized to read the kagent API for installation '${this.installation.name}'.`,
      );
    }

    // Only for the caller that asked. Deliberately above the 404 handling and
    // the generic `!response.ok` branch, both of which would otherwise claim
    // this one.
    if (response.status === 400 && badRequest) {
      throw badRequestError(
        `The kagent API for installation '${this.installation.name}' rejected the request.`,
      );
    }

    // Also above the generic `!response.ok` branch, so an expected conflict does
    // not become a 5xx.
    if (response.status === 409 && conflict) {
      throw new ConflictError(
        `The kagent API for installation '${this.installation.name}' reported a conflict.`,
      );
    }

    if (response.status === 404) {
      // Two very different things arrive here, and conflating them shows users a
      // message about the wrong problem:
      //
      // - **kagent's handler said "no such resource".** Its error middleware
      //   always answers `Content-Type: application/json`
      //   (`go/core/internal/httpserver/middleware_error.go`), so a JSON 404 means
      //   the endpoint exists and the thing we asked for does not — a deleted
      //   session, or one belonging to another user.
      // - **The route does not exist.** kagent registers no custom
      //   `NotFoundHandler`, so an unrouted path falls through to net/http's
      //   `http.NotFound`, which answers `text/plain`. That is what an
      //   installation running a kagent older than an endpoint looks like.
      //
      // The second case matters most for the session routes: without the
      // distinction, "this kagent is too old" would read as "session not found" on
      // every session, on every page load, with no way to tell from the UI.
      //
      // kagent's own message is deliberately *not* forwarded: its middleware
      // appends the underlying error, so a session 404 reads
      // "Session not found: no rows in result set" — database internals are not
      // something to put in front of a user.
      const contentType = response.headers.get('content-type') ?? '';
      const kagentAnswered = contentType.includes('application/json');

      if (!kagentAnswered && notFound) {
        throw new NotFoundError(
          `The kagent API for installation '${this.installation.name}' has no ${notFound.endpoint} endpoint; it is probably running a version that predates it.`,
        );
      }
      throw new NotFoundError(
        notFound?.missingResource ??
          `The kagent API is not available for installation '${this.installation.name}'.`,
      );
    }

    if (!response.ok) {
      // Anything else non-ok (5xx, 429, …) means kagent or its ingress answered
      // and failed. It is deployed but unwell, so this must NOT share
      // ServiceUnavailableError with "host unreachable" — the frontend silences
      // that one, which would make a degraded kagent look like an empty account.
      this.logger.debug(
        `kagent API returned an error status for installation '${this.installation.name}'`,
        { status: response.status },
      );
      throw upstreamError(
        `The kagent API for installation '${this.installation.name}' returned status ${response.status}.`,
      );
    }

    // `204 No Content` is a success with nothing to parse, and must be handled
    // before the guards below: it carries no content-type, so the sign-in-page
    // check would call it an authentication failure, and `response.json()` would
    // throw on the empty body. Nothing kagent serves today answers 204 — its
    // delete returns 200 with the usual envelope on both v0.9.9 and v0.10 — but
    // getting this wrong is expensive in one specific direction: a future version
    // that answered 204 to the DELETE would have *performed* the deletion while
    // this told the user a sign-in page was served, and the frontend would leave
    // the confirmation dialog open on an error for a session that is already gone.
    if (response.status === 204) {
      return undefined;
    }

    // A 2xx with a non-JSON body is oauth2-proxy serving its sign-in page
    // rather than kagent answering.
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      throw new AuthenticationError(
        `The kagent API for installation '${this.installation.name}' returned a non-JSON response (content-type '${contentType}'), which usually means a sign-in page was served instead.`,
      );
    }

    // Reading the body is a second chance to fail: the abort signal is still
    // armed after the headers arrive, so a slow or large response can abort
    // mid-stream, the connection can reset, or the body can be truncated /
    // invalid JSON. kagent answered in all of those cases, so they are upstream
    // failures worth surfacing — not "kagent isn't deployed here".
    try {
      return await response.json();
    } catch (error) {
      this.logger.debug(
        `Failed to read the kagent API response body for installation '${this.installation.name}'`,
        { error: String(error) },
      );
      throw upstreamError(
        `Could not read the response from the kagent API for installation '${this.installation.name}'.`,
      );
    }
  }
}
