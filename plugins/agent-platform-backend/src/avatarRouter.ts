import {
  LoggerService,
  RootLifecycleService,
} from '@backstage/backend-plugin-api';
import { Config } from '@backstage/config';
import { InputError, NotFoundError } from '@backstage/errors';
import express from 'express';
import Router from 'express-promise-router';
import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import { isIP, type LookupFunction } from 'node:net';
import {
  Agent,
  buildConnector,
  fetch as undiciFetch,
  getGlobalDispatcher,
} from 'undici';
import {
  errorCode,
  eventLoopUtilizationMeter,
  isDnsErrorCode,
  isProbeTimeout,
  type LoopUtilizationMeter,
  STARVED_LOOP_UTILIZATION,
} from '@giantswarm/backstage-plugin-gs-node';
import { readInstallationBaseDomain } from './installationDomain';

/**
 * `GET /avatars/:installation/v1/...`: the portal's agent avatars, proxied.
 *
 * Every agent has a deterministic icon, rendered by the DiceBear service that
 * ships with the agent-platform chart at `avatars.<baseDomain>` of its
 * installation:
 *
 *   /v1/<name>.png                     the default size
 *   /v1/<size>/<name>.png              a size from {@link AVATAR_SIZES}
 *   /v1/preview[/<size>]/<name>.png    uncached, for the live preview while naming
 *
 * The browser used to load those hosts directly, which made every deployment
 * allowlist its installations' avatar hosts in the `img-src` of its
 * Content-Security-Policy — a header sent with the unauthenticated page, naming
 * each installation's base domain to anyone who asks for it. This route takes
 * the same path below `/avatars/<installation>` and fetches it from the
 * installation the backend-only config knows, so the `<img>` loads same-origin
 * and the policy needs no per-installation entry.
 *
 * Allowlist discipline, the same as the served-model try: the installation
 * must be a configured one with a base domain, the size one of the endpoint's
 * own, the name a DNS label; the upstream URL is assembled from those parts
 * and nothing else of the request reaches it. Redirects are refused, so an
 * upstream cannot send this backend anywhere else either.
 *
 * An installation that serves no avatars (its avatars host has no address,
 * or a route that is not the renderer answers 406 because DiceBear is off)
 * answers 404, the answer for an agent without an avatar, for a minute without
 * asking again: the browser shows the initials. So does an installation whose
 * avatars host this backend cannot connect to directly (no route to its
 * address, no connection within {@link UPSTREAM_CONNECT_TIMEOUT_MS}), for
 * {@link UNREACHABLE_TTL_MS}: the network between the two, not a renderer.
 * Each finding is logged once per period at info. A 502 is left for a renderer
 * or gateway in trouble (another 4xx, a 5xx, a refused connection, no answer
 * in time once connected, something other than a raster image) and for an
 * egress proxy that cannot be connected to.
 *
 * Authentication is the plugin's cookie policy for this path — an `<img>`
 * carries no bearer token — see plugin.ts.
 */
export interface AvatarRouterOptions {
  config: Config;
  logger: LoggerService;
  /**
   * Overridable for tests; defaults to {@link createAvatarFetch}'s, whose
   * connections are closed from the shutdown hook when `lifecycle` is given.
   */
  fetchFn?: typeof fetch;
  lifecycle?: Pick<RootLifecycleService, 'addShutdownHook'>;
  /** Overridable clock for tests. */
  now?: () => number;
  /** Overridable for tests; defaults to gs-node's `eventLoopUtilizationMeter`. */
  loopMeter?: LoopUtilizationMeter;
}

/** Sizes the avatar endpoint allowlists. Must match AVATAR_SIZES in plugins/agent-platform. */
export const AVATAR_SIZES = [48, 96, 128, 512] as const;

export type AvatarSize = (typeof AVATAR_SIZES)[number];

/** An agent's technical name, a DNS-1123 label: the avatar is seeded by it. */
const NAME_PATTERN = /^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$/;

/** The whole fetch, from connecting to the last byte of the image. */
const UPSTREAM_TIMEOUT_MS = 10_000;

/**
 * Connecting to the avatars host, TCP and TLS, once its name is resolved (see
 * {@link resolveThenConnect}): what tells a host this backend cannot reach
 * from one that is reachable but slow. A reachable host connects in
 * milliseconds, across a continent in well under one; 3 s leaves room for one
 * lost SYN (retransmitted after 1 s). The same budget as the reachability
 * probes of gs-node (`DEFAULT_PROBE_TIMEOUT_MS`).
 */
const UPSTREAM_CONNECT_TIMEOUT_MS = 3_000;

/** Far above any avatar the renderer produces: a bound, not a budget. */
const MAX_BODY_BYTES = 2 * 1024 * 1024;

/**
 * What the upstream is asked for: any image. The renderer answers a `.png`
 * path with a PNG whatever the header says; a narrower `Accept` only gives a
 * negotiating proxy in front of it a reason to refuse (406). The content type
 * is checked on the answer instead.
 */
const UPSTREAM_ACCEPT = 'image/*';

/**
 * The image types forwarded: raster only. An SVG is a document that can carry
 * script, and it would be served same-origin; anything else is a failure and
 * the browser shows the initials.
 */
const RASTER_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);

/** The media type of a `Content-Type` header, without its parameters. */
function mediaType(contentType: string): string {
  return contentType.split(';')[0].trim().toLowerCase();
}

/** What the browser should see of an avatar exactly as the upstream sent it. */
const FORWARDED_HEADERS = ['content-type', 'cache-control', 'etag'] as const;

export type AvatarTarget = {
  preview: boolean;
  size?: AvatarSize;
  name: string;
};

/**
 * The path segments below `/v1/` as one of the endpoint's paths, or an
 * `InputError` (a 400) when they are not.
 *
 * Sizes match by their exact spelling: `Number()` would accept `0x30` for 48.
 */
export function parseAvatarPath(segments: string[]): AvatarTarget {
  const rest = [...segments];
  const preview = rest[0] === 'preview';
  if (preview) {
    rest.shift();
  }

  let size: AvatarSize | undefined;
  if (rest.length === 2) {
    const spelled = rest.shift();
    size = AVATAR_SIZES.find(allowed => String(allowed) === spelled);
    if (!size) {
      throw new InputError(
        `The avatar size must be one of ${AVATAR_SIZES.join(', ')}.`,
      );
    }
  }

  if (rest.length !== 1) {
    throw new InputError(
      'The avatar path is /v1[/preview][/<size>]/<name>.png.',
    );
  }
  const file = rest[0];
  if (!file.endsWith('.png')) {
    throw new InputError('An avatar is a .png.');
  }
  const name = file.slice(0, -'.png'.length);
  if (!NAME_PATTERN.test(name)) {
    throw new InputError(
      "The avatar's name must be a DNS label (lowercase letters, digits and dashes).",
    );
  }

  return { preview, size, name };
}

/** The path below the avatars host, rebuilt from the validated parts only. */
export function avatarPath(target: AvatarTarget): string {
  const segments = ['v1'];
  if (target.preview) {
    segments.push('preview');
  }
  if (target.size) {
    segments.push(String(target.size));
  }
  segments.push(`${target.name}.png`);
  return segments.join('/');
}

type UpstreamAnswer =
  | { kind: 'ok'; headers: Headers; body: Buffer }
  | { kind: 'not-modified'; headers: Headers }
  | { kind: 'not-found' }
  | {
      /**
       * The installation serves no avatars ({@link NOT_SERVED_STATUS}, or no
       * address for its avatars host): the answer for an agent without an
       * avatar, not a fault of a renderer.
       */
      kind: 'not-served';
      reason: string;
      details?: Record<string, string | number>;
    }
  | {
      /**
       * No connection to the avatars host could be made
       * ({@link CONNECT_FAILURE_CODES}): this backend cannot reach the
       * installation, whatever its renderer would answer.
       */
      kind: 'unreachable';
      code: string;
      reason: string;
      details?: Record<string, string | number>;
    }
  | {
      kind: 'failed';
      /** Fixed wording for the log message (Sentry fingerprints on it). */
      problem: string;
      /** The full reason, for the 502 answer. */
      reason: string;
      /** The varying parts, for the log's structured metadata. */
      details?: Record<string, string | number>;
    };

/**
 * The status that says the avatars host is not the renderer: the renderer
 * answers any `image/*`, so a 406 comes from a route that negotiates something
 * else — the edge's catch-all MCP route of an installation whose DiceBear is
 * off. Every other 4xx (an auth gate, a rate limit, a size a renderer
 * refuses) is a renderer or a gateway in trouble and stays a 502.
 */
const NOT_SERVED_STATUS = 406;

/** How long an installation that serves no avatars is not asked again. */
const NOT_SERVED_TTL_MS = 60_000;

/**
 * How long an installation whose avatars host cannot be connected to is not
 * asked again. Longer than {@link NOT_SERVED_TTL_MS}: a finding costs a wait of
 * up to {@link UPSTREAM_CONNECT_TIMEOUT_MS}, and a network path changes rarely.
 * Short enough that an installation that comes back shows its avatars again
 * within minutes, without a restart.
 */
const UNREACHABLE_TTL_MS = 5 * 60_000;

/** undici's error code for its own connect timeout. */
const CONNECT_TIMEOUT_CODE = 'UND_ERR_CONNECT_TIMEOUT';

/**
 * Error codes that say no connection to the avatars host could be made: the
 * connect timeout of undici (TCP and TLS, see
 * {@link UPSTREAM_CONNECT_TIMEOUT_MS}) and the kernel's answers for an address
 * no route leads to. Not among them: a refused connection (the address was
 * reached and nothing listens on it, a gateway that is down), a reset, a TLS
 * failure, or a timeout once connected (`ETIMEDOUT` of an established socket;
 * undici reports a timeout while connecting as {@link CONNECT_TIMEOUT_CODE}).
 */
const CONNECT_FAILURE_CODES = new Set([
  CONNECT_TIMEOUT_CODE,
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EHOSTDOWN',
]);

/**
 * Errors of fetches that went through the backend's global dispatcher rather
 * than {@link createAvatarFetch}'s own: behind an egress proxy, a connection
 * that cannot be made is to the proxy, a fault of this backend's way out that
 * keeps its warning, not a finding about the installation.
 */
const throughSharedDispatcher = new WeakSet<object>();

/** The address family a lookup asks for, 0 for any. */
const LOOKUP_FAMILIES: Record<string, 4 | 6> = {
  '4': 4,
  IPv4: 4,
  '6': 6,
  IPv6: 6,
};

/** A `lookup` for `net.connect` that answers from addresses resolved before. */
function lookupFrom(addresses: LookupAddress[]): LookupFunction {
  return (hostname, options, callback) => {
    const family = LOOKUP_FAMILIES[String(options.family)] ?? 0;
    const matching = family
      ? addresses.filter(address => address.family === family)
      : addresses;
    if (options.all) {
      callback(null, matching);
      return;
    }
    const [first] = matching;
    if (first) {
      callback(null, first.address, first.family);
      return;
    }
    callback(
      Object.assign(new Error(`getaddrinfo ENOTFOUND ${hostname}`), {
        code: 'ENOTFOUND',
      }),
      '',
    );
  };
}

/**
 * undici's connector, with the host name resolved before it starts: undici's
 * connect timer covers the name lookup too, and a slow resolver (a lost UDP
 * query waits 5 s for its retry) would otherwise turn a reachable host into a
 * connect timeout cached for {@link UNREACHABLE_TTL_MS}. The lookup is bounded
 * by {@link UPSTREAM_TIMEOUT_MS} instead, and its failure keeps its own code
 * (a name without an address is `not-served`). Every address the name has is
 * handed on, so Node still tries the next family when one does not connect.
 * A connector per connection keeps no state between them; it costs TLS
 * session resumption, which keep-alive makes rare anyway.
 */
function resolveThenConnect(
  connectTimeoutMs: number,
  lookup: typeof dnsLookup,
): buildConnector.connector {
  return (options, callback) => {
    if (isIP(options.hostname)) {
      buildConnector({ timeout: connectTimeoutMs })(options, callback);
      return;
    }
    lookup(options.hostname, { all: true }, (error, addresses) => {
      if (error) {
        callback(error, null);
        return;
      }
      buildConnector({
        timeout: connectTimeoutMs,
        lookup: lookupFrom(addresses),
      })(options, callback);
    });
  };
}

export type AvatarFetch = {
  fetch: typeof fetch;
  /** Closes the direct connections; for the plugin's shutdown. */
  close: () => Promise<void>;
};

/**
 * The fetch of the avatars: undici's own, with a dispatcher whose connect
 * timeout is {@link UPSTREAM_CONNECT_TIMEOUT_MS}, counted from the resolved
 * name, so a host that cannot be connected to fails as such in 3 s, rather
 * than as no answer within {@link UPSTREAM_TIMEOUT_MS}. (Node's built-in
 * `fetch` bundles an older undici, which refuses a dispatcher of the undici
 * package.)
 *
 * When the backend's global dispatcher is not undici's plain `Agent` (an
 * egress proxy, installed by `configureFetchProxy` of `backend-common`), the
 * avatars go through it: a dispatcher of this module's own would go around the
 * proxy. A connection that cannot be made then is to the proxy, or to a host
 * the proxy's `noProxy` exempts at undici's 10-s default, and fails as before
 * this dispatcher existed: a 502 and a warning.
 */
export function createAvatarFetch(
  options: {
    connectTimeoutMs?: number;
    /** Overridable for tests; defaults to `dns.lookup`. */
    lookup?: typeof dnsLookup;
  } = {},
): AvatarFetch {
  const direct = new Agent({
    connect: resolveThenConnect(
      options.connectTimeoutMs ?? UPSTREAM_CONNECT_TIMEOUT_MS,
      options.lookup ?? dnsLookup,
    ),
  });
  const avatarFetch = async (url: string, init: RequestInit) => {
    const shared = getGlobalDispatcher();
    const request = {
      ...(init as Parameters<typeof undiciFetch>[1]),
    };
    if (shared instanceof Agent) {
      return undiciFetch(url, { ...request, dispatcher: direct });
    }
    try {
      return await undiciFetch(url, { ...request, dispatcher: shared });
    } catch (error) {
      if (typeof error === 'object' && error !== null) {
        throughSharedDispatcher.add(error);
      }
      throw error;
    }
  };
  return {
    fetch: avatarFetch as unknown as typeof fetch,
    close: () => direct.close(),
  };
}

/**
 * The findings answered as an installation without avatars: how long each is
 * kept, its log message (fixed) and the message of the 404.
 */
const FINDINGS: Record<
  'not-served' | 'unreachable',
  {
    ttlMs: number;
    log: string;
    message: (installation: string, reason: string) => string;
  }
> = {
  'not-served': {
    ttlMs: NOT_SERVED_TTL_MS,
    log: 'The installation serves no avatars',
    message: (installation, reason) =>
      `The installation '${installation}' serves no avatars: its avatars host ${reason}.`,
  },
  unreachable: {
    ttlMs: UNREACHABLE_TTL_MS,
    log: 'The avatar service cannot be connected to',
    message: (installation, reason) =>
      `The avatar service of '${installation}' ${reason}.`,
  },
};

/** Lets an unread answer's connection go back to the pool. */
async function discard(upstream: Response): Promise<void> {
  await upstream.body?.cancel().catch(() => undefined);
}

/**
 * One fetch of an avatar, classified. Nothing of the browser's request goes
 * along except its `If-None-Match`, so a cached avatar revalidates through
 * here rather than being fetched again.
 */
async function fetchAvatar(
  fetchFn: typeof fetch,
  url: string,
  ifNoneMatch: string | undefined,
): Promise<UpstreamAnswer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const upstream = await fetchFn(url, {
      headers: {
        Accept: UPSTREAM_ACCEPT,
        ...(ifNoneMatch ? { 'If-None-Match': ifNoneMatch } : {}),
      },
      redirect: 'error',
      signal: controller.signal,
    });

    if (upstream.status === 304) {
      return { kind: 'not-modified', headers: upstream.headers };
    }
    if (upstream.status === 404) {
      await discard(upstream);
      return { kind: 'not-found' };
    }
    const contentType = upstream.headers.get('content-type') ?? '';
    if (!upstream.ok) {
      await discard(upstream);
      const reason = contentType
        ? `answered ${upstream.status} with ${contentType}`
        : `answered ${upstream.status}`;
      const details = { status: upstream.status, contentType };
      return upstream.status === NOT_SERVED_STATUS
        ? { kind: 'not-served', reason, details }
        : { kind: 'failed', problem: 'answered an error', reason, details };
    }

    if (!RASTER_TYPES.has(mediaType(contentType))) {
      await discard(upstream);
      return {
        kind: 'failed',
        problem: 'answered something other than a raster image',
        reason: `answered ${contentType || 'no content type'} rather than a raster image`,
        details: { contentType },
      };
    }
    const declared = Number(upstream.headers.get('content-length') ?? 0);
    if (declared > MAX_BODY_BYTES) {
      await discard(upstream);
      return {
        kind: 'failed',
        problem: 'sent an avatar too large to forward',
        reason: `declared ${declared} bytes`,
        details: { bytes: declared },
      };
    }
    const body = Buffer.from(await upstream.arrayBuffer());
    if (body.byteLength > MAX_BODY_BYTES) {
      return {
        kind: 'failed',
        problem: 'sent an avatar too large to forward',
        reason: `sent ${body.byteLength} bytes`,
        details: { bytes: body.byteLength },
      };
    }
    return { kind: 'ok', headers: upstream.headers, body };
  } catch (error) {
    if (isProbeTimeout(error)) {
      // Directly, connected: the shorter connect timeout would have fired
      // first. A renderer or a gateway that is slow (or, behind a proxy, a
      // host that could not be connected to in time).
      return {
        kind: 'failed',
        problem: 'did not answer in time',
        reason: `no answer within ${UPSTREAM_TIMEOUT_MS / 1000} s`,
      };
    }
    const message = error instanceof Error ? error.message : String(error);
    const code = errorCode(error);
    if (isDnsErrorCode(code)) {
      return {
        kind: 'not-served',
        reason: `has no address (${code})`,
        details: { error: message },
      };
    }
    if (
      code &&
      CONNECT_FAILURE_CODES.has(code) &&
      !throughSharedDispatcher.has(error as object)
    ) {
      // The code only: undici's and the kernel's messages name the address.
      return {
        kind: 'unreachable',
        code,
        reason: `cannot be connected to (${code})`,
        details: { code, error: message },
      };
    }
    return {
      kind: 'failed',
      problem: 'could not be reached',
      reason: message,
      details: { error: message },
    };
  } finally {
    clearTimeout(timer);
  }
}

function forwardHeaders(res: express.Response, headers: Headers): void {
  for (const name of FORWARDED_HEADERS) {
    const value = headers.get(name);
    if (value) {
      res.setHeader(name, value);
    }
  }
}

export function createAvatarRouter(
  options: AvatarRouterOptions,
): express.Router {
  const { config, logger } = options;
  let fetchFn = options.fetchFn;
  if (!fetchFn) {
    const avatarFetch = createAvatarFetch();
    options.lifecycle?.addShutdownHook(() => avatarFetch.close());
    fetchFn = avatarFetch.fetch;
  }
  const now = options.now ?? Date.now;
  const loopMeter = options.loopMeter ?? eventLoopUtilizationMeter;
  const router = Router();
  /**
   * Installations found to serve no avatars or to be unreachable, until when,
   * and the message of the answer.
   */
  const withoutAvatars = new Map<string, { until: number; message: string }>();

  // A 404 with the reason, cached as long as the finding is: the browser does
  // not ask again until it expires, and this backend does not ask the
  // upstream.
  const answerWithoutAvatars = (
    res: express.Response,
    finding: { until: number; message: string },
  ) => {
    const maxAge = Math.max(0, Math.ceil((finding.until - now()) / 1000));
    res.setHeader('Cache-Control', `private, max-age=${maxAge}`);
    res.status(404).json({
      error: { name: 'NotFoundError', message: finding.message },
    });
  };

  /**
   * Records a finding for its period, and whether it is new. The avatars of a
   * page are asked for at once, and the answers that come back after the
   * first one's find a finding still valid: it stays as it is (its kind, its
   * message, its period) and is not logged again.
   */
  const record = (installation: string, message: string, ttlMs: number) => {
    const previous = withoutAvatars.get(installation);
    if (previous && previous.until > now()) {
      return { finding: previous, isNew: false };
    }
    const finding = { until: now() + ttlMs, message };
    withoutAvatars.set(installation, finding);
    return { finding, isNew: true };
  };

  router.get('/avatars/:installation/v1/*rest', async (req, res) => {
    const installation = String(req.params.installation);
    // Express 5 hands a wildcard's segments over decoded, as an array.
    const rest: unknown = req.params.rest;
    const target = parseAvatarPath(
      Array.isArray(rest) ? rest.map(String) : [String(rest)],
    );

    const baseDomain = readInstallationBaseDomain(config, installation);
    if (!baseDomain) {
      throw new NotFoundError(
        `No installation '${installation}' with a base domain is configured.`,
      );
    }
    const url = `https://avatars.${baseDomain}/${avatarPath(target)}`;

    const known = withoutAvatars.get(installation);
    if (known && known.until > now()) {
      answerWithoutAvatars(res, known);
      return;
    }

    const ifNoneMatch = req.headers['if-none-match'];
    const loopBusy = loopMeter();
    const answer = await fetchAvatar(
      fetchFn,
      url,
      typeof ifNoneMatch === 'string' ? ifNoneMatch : undefined,
    );

    switch (answer.kind) {
      case 'ok':
        // `end` rather than `send`: the browser sees the upstream's headers
        // and nothing invented here, no weak ETag for an image that came
        // without one (the preview route's, for instance).
        forwardHeaders(res, answer.headers);
        res.setHeader('Content-Length', String(answer.body.byteLength));
        res.status(200).end(answer.body);
        return;
      case 'not-modified':
        forwardHeaders(res, answer.headers);
        res.status(304).end();
        return;
      case 'not-found':
        throw new NotFoundError(
          `No avatar for '${target.name}' on '${installation}'.`,
        );
      case 'not-served':
      case 'unreachable': {
        // A defined answer, not a failure: the browser shows the initials, as
        // for any agent without an avatar. Logged once per finding at info,
        // so an installation that should serve avatars (a wrong base domain,
        // a renderer switched off by mistake) or a network path that should
        // exist still shows in the logs. An unreachable installation (a
        // gateway with a private address only) would otherwise cost a wait
        // and a warning per avatar on every page.
        const finding = FINDINGS[answer.kind];
        const metadata = { url, installation, ...answer.details };
        if (
          answer.kind === 'unreachable' &&
          answer.code === CONNECT_TIMEOUT_CODE &&
          loopBusy() >= STARVED_LOOP_UTILIZATION
        ) {
          // The connect timer may have fired before this process got to the
          // handshake that had arrived: the timeout says more about the
          // process than the host. Initials for now, nothing recorded.
          logger.info(`${finding.log} while this process was busy`, metadata);
          res.setHeader('Cache-Control', 'no-store');
          res.status(404).json({
            error: {
              name: 'NotFoundError',
              message: finding.message(installation, answer.reason),
            },
          });
          return;
        }
        const { finding: recorded, isNew } = record(
          installation,
          finding.message(installation, answer.reason),
          finding.ttlMs,
        );
        if (isNew) {
          logger.info(finding.log, metadata);
        }
        answerWithoutAvatars(res, recorded);
        return;
      }
      case 'failed':
        // Answered rather than thrown: `MiddlewareFactory.error()` forwards
        // every 5xx to Sentry, and an avatar service that is down fails once
        // per avatar on every page that lists agents. One warning per image
        // names the upstream and the reason; the browser shows the initials.
        // The message stays fixed per kind of problem (Sentry fingerprints on
        // it); what varies goes into the metadata.
        logger.warn(`The avatar service ${answer.problem}`, {
          url,
          installation,
          ...answer.details,
        });
        res.status(502).json({
          error: {
            name: 'BadGateway',
            message: `The avatar service of '${installation}' ${answer.reason}.`,
          },
        });
        return;
      default:
        return;
    }
  });

  return router;
}
