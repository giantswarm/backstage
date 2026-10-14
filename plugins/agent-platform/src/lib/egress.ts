/**
 * The HTTP(S) origins an Agent may reach besides what its revision compiles
 * (`Agent.spec.egress`): the model, the MCP servers, the skill and plugin
 * sources and telemetry need no entry. The CRD takes an origin such as
 * `https://proxy.golang.org` or `https://github.com:443`; the host may carry
 * `*` as its leftmost label (`https://*.githubusercontent.com`), which matches
 * exactly one label and needs two labels under it. Nothing opens every host.
 */
export const MAX_EGRESS_ORIGINS = 64;
export const MAX_EGRESS_ORIGIN_LENGTH = 270;

const LABEL = '[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?';
const PORT =
  '[1-9][0-9]{0,3}|[1-5][0-9]{4}|6[0-4][0-9]{3}|65[0-4][0-9]{2}|655[0-2][0-9]|6553[0-5]';

/** The CRD's `items.pattern` for `spec.egress`. */
export const EGRESS_ORIGIN_PATTERN = new RegExp(
  `^https?://(\\*\\.(${LABEL}\\.)+|(${LABEL}\\.)*)[a-z]([-a-z0-9]{0,61}[a-z0-9])?(:(${PORT}))?$`,
);

/** The origins as typed, one per line; blank lines and surrounding spaces dropped. */
export function parseEgressText(text: string): string[] {
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line !== '');
}

/** The form's text for a list of origins: one per line. */
export function egressTextOf(origins: readonly string[] | undefined): string {
  return (origins ?? []).join('\n');
}

/** Why the egress list cannot be sent, or undefined when it can. */
export function egressProblem(origins: readonly string[]): string | undefined {
  if (origins.length > MAX_EGRESS_ORIGINS) {
    return `${origins.length} egress origins; the limit is ${MAX_EGRESS_ORIGINS}`;
  }
  const seen = new Set<string>();
  for (const origin of origins) {
    if (origin.length > MAX_EGRESS_ORIGIN_LENGTH) {
      return `Egress origin "${shorten(origin)}" is longer than ${MAX_EGRESS_ORIGIN_LENGTH} characters`;
    }
    if (!EGRESS_ORIGIN_PATTERN.test(origin)) {
      return `Egress origin "${shorten(origin)}" is not an http(s) origin such as https://github.com:443 or https://*.githubusercontent.com (lowercase host, optional port, no path)`;
    }
    if (seen.has(origin)) {
      return `Egress origin "${origin}" is listed twice`;
    }
    seen.add(origin);
  }
  return undefined;
}

function shorten(origin: string): string {
  return origin.length > 60 ? `${origin.slice(0, 57)}…` : origin;
}

export function sameEgress(
  a: readonly string[],
  b: readonly string[],
): boolean {
  return (
    a.length === b.length && a.every((origin, index) => origin === b[index])
  );
}
