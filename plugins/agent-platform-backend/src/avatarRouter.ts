import { LoggerService } from '@backstage/backend-plugin-api';
import { Config } from '@backstage/config';
import { InputError, NotFoundError } from '@backstage/errors';
import express from 'express';
import Router from 'express-promise-router';
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
 * Authentication is the plugin's cookie policy for this path — an `<img>`
 * carries no bearer token — see plugin.ts.
 */
export interface AvatarRouterOptions {
  config: Config;
  logger: LoggerService;
  /** Overridable for tests. */
  fetchFn?: typeof fetch;
}

/** Sizes the avatar endpoint allowlists. Must match AVATAR_SIZES in plugins/agent-platform. */
export const AVATAR_SIZES = [48, 96, 128, 512] as const;

export type AvatarSize = (typeof AVATAR_SIZES)[number];

/** An agent's technical name, a DNS-1123 label: the avatar is seeded by it. */
const NAME_PATTERN = /^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$/;

const UPSTREAM_TIMEOUT_MS = 10_000;

/** Far above any avatar the renderer produces: a bound, not a budget. */
const MAX_BODY_BYTES = 2 * 1024 * 1024;

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
  | { kind: 'failed'; reason: string };

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
        Accept: 'image/png',
        ...(ifNoneMatch ? { 'If-None-Match': ifNoneMatch } : {}),
      },
      redirect: 'error',
      signal: controller.signal,
    });

    if (upstream.status === 304) {
      return { kind: 'not-modified', headers: upstream.headers };
    }
    if (upstream.status === 404) {
      return { kind: 'not-found' };
    }
    if (!upstream.ok) {
      return { kind: 'failed', reason: `answered ${upstream.status}` };
    }

    const contentType = upstream.headers.get('content-type') ?? '';
    if (!contentType.startsWith('image/')) {
      return {
        kind: 'failed',
        reason: `answered ${contentType || 'no content type'} rather than an image`,
      };
    }
    const declared = Number(upstream.headers.get('content-length') ?? 0);
    if (declared > MAX_BODY_BYTES) {
      return { kind: 'failed', reason: `declared ${declared} bytes` };
    }
    const body = Buffer.from(await upstream.arrayBuffer());
    if (body.byteLength > MAX_BODY_BYTES) {
      return { kind: 'failed', reason: `sent ${body.byteLength} bytes` };
    }
    return { kind: 'ok', headers: upstream.headers, body };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        kind: 'failed',
        reason: `no answer within ${UPSTREAM_TIMEOUT_MS / 1000} s`,
      };
    }
    return {
      kind: 'failed',
      reason: error instanceof Error ? error.message : String(error),
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
  const router = Router();

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
      case 'failed':
        // Answered rather than thrown: `MiddlewareFactory.error()` forwards
        // every 5xx to Sentry, and an avatar service that is down fails once
        // per avatar on every page that lists agents. One warning per image
        // names the upstream and the reason; the browser shows the initials.
        logger.warn(`The avatar service ${answer.reason}`, {
          url,
          installation,
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
