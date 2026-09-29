/**
 * Agent avatar URLs.
 *
 * Every agent gets a deterministic identifying icon rendered by the self-hosted
 * DiceBear service that ships with the agent-platform bundle. The icon is a
 * pure function of the agent's technical (DNS-1123) name — no per-agent state,
 * nothing stored.
 *
 * Canonical URL contract (see giantswarm/giantswarm#37211):
 *   avatars.<baseDomain>/v1/<name>.png              (512, the default)
 *   avatars.<baseDomain>/v1/<size>/<name>.png       (size from AVATAR_SIZES)
 *   avatars.<baseDomain>/v1/preview[/<size>]/<name>.png  (Cache-Control: no-store)
 *
 * The host mirrors the Grafana pattern (`grafana.<baseDomain>`): `baseDomain`
 * already includes the installation codename, so the host is
 * `avatars.<baseDomain>`. That canonical URL is what an agent's resource
 * records as its `iconUrl`, for every A2A client to load.
 *
 * The portal's own `<img>`s do not load it: they load the same path through
 * the agent-platform backend (`/api/agent-platform/avatars/<installation>/...`),
 * which fetches it from the installation's host. Same-origin, so the page's
 * Content-Security-Policy needs no per-installation `img-src` entry — the
 * header is sent with the unauthenticated page, and an installation's base
 * domain is not for everyone to read.
 */

/** Sizes the avatar endpoint allowlists. Any other size is rejected at the edge. */
export const AVATAR_SIZES = [48, 96, 128, 512] as const;

export type AvatarSize = (typeof AVATAR_SIZES)[number];

export type AgentAvatarUrlOptions = {
  /** Requested pixel size; omit for the endpoint default (512). */
  size?: AvatarSize;
  /**
   * Use the no-cache preview route, for the debounced live preview during agent
   * creation — throwaway seeds typed while naming never enter any cache.
   */
  preview?: boolean;
};

/** The path below the avatars host: `v1[/preview][/<size>]/<name>.png`. */
function avatarPath(name: string, opts: AgentAvatarUrlOptions): string {
  const segments = ['v1'];
  if (opts.preview) {
    segments.push('preview');
  }
  if (opts.size) {
    segments.push(String(opts.size));
  }
  segments.push(`${encodeURIComponent(name)}.png`);
  return segments.join('/');
}

/**
 * Build the canonical avatar URL for an agent's technical name on a given
 * installation base domain: the URL recorded on the agent for other clients.
 */
export function buildAgentAvatarUrl(
  baseDomain: string,
  name: string,
  opts: AgentAvatarUrlOptions = {},
): string {
  return `https://avatars.${baseDomain}/${avatarPath(name, opts)}`;
}

/**
 * Build the URL the portal's own `<img>` loads: the same path, served by the
 * agent-platform backend for the installation, from the portal's origin.
 */
export function buildProxiedAgentAvatarUrl(
  backendBaseUrl: string,
  installation: string,
  name: string,
  opts: AgentAvatarUrlOptions = {},
): string {
  const backend = backendBaseUrl.replace(/\/+$/, '');
  return `${backend}/api/agent-platform/avatars/${encodeURIComponent(
    installation,
  )}/${avatarPath(name, opts)}`;
}
