import { LoggerService } from '@backstage/backend-plugin-api';
import { Config } from '@backstage/config';
import { InputError, NotFoundError } from '@backstage/errors';
import express from 'express';
import Router from 'express-promise-router';
import {
  errorCode,
  isDnsErrorCode,
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
 * asking again: the browser shows the initials. A 502 is left for a renderer
 * or gateway in trouble (another 4xx, a 5xx, a timeout, something other than
 * a raster image).
 *
 * Authentication is the plugin's cookie policy for this path — an `<img>`
 * carries no bearer token — see plugin.ts.
 */
export interface AvatarRouterOptions {
  config: Config;
  logger: LoggerService;
  /** Overridable for tests. */
  fetchFn?: typeof fetch;
  /** Overridable clock for tests. */
  now?: () => number;
}

/** Sizes the avatar endpoint allowlists. Must match AVATAR_SIZES in plugins/agent-platform. */
export const AVATAR_SIZES = [48, 96, 128, 512] as const;

export type AvatarSize = (typeof AVATAR_SIZES)[number];

/** An agent's technical name, a DNS-1123 label: the avatar is seeded by it. */
const NAME_PATTERN = /^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$/;

const UPSTREAM_TIMEOUT_MS = 10_000;

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
    if (error instanceof Error && error.name === 'AbortError') {
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
  const fetchFn = options.fetchFn ?? fetch;
  const now = options.now ?? Date.now;
  const router = Router();
  /** Installations found to serve no avatars, until when, and why. */
  const notServed = new Map<string, { until: number; reason: string }>();

  // A 404 with the reason, cached as long as the finding is: the browser does
  // not ask again for a minute, and this backend does not ask the upstream.
  const answerNotServed = (
    res: express.Response,
    installation: string,
    reason: string,
    until: number,
  ) => {
    const maxAge = Math.max(0, Math.ceil((until - now()) / 1000));
    res.setHeader('Cache-Control', `private, max-age=${maxAge}`);
    res.status(404).json({
      error: {
        name: 'NotFoundError',
        message: `The installation '${installation}' serves no avatars: its avatars host ${reason}.`,
      },
    });
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

    const known = notServed.get(installation);
    if (known && known.until > now()) {
      answerNotServed(res, installation, known.reason, known.until);
      return;
    }

    const ifNoneMatch = req.headers['if-none-match'];
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
      case 'not-served': {
        // A defined answer, not a failure: the browser shows the initials, as
        // for any agent without an avatar. Logged once per finding at info,
        // so an installation that should serve avatars (a wrong base domain,
        // a renderer switched off by mistake) still shows in the logs.
        const until = now() + NOT_SERVED_TTL_MS;
        notServed.set(installation, { until, reason: answer.reason });
        logger.info('The installation serves no avatars', {
          url,
          installation,
          ...answer.details,
        });
        answerNotServed(res, installation, answer.reason, until);
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
