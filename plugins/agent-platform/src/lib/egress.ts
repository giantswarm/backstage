/**
 * The origins an Agent may reach besides what its revision compiles
 * (`Agent.spec.egress`): the model, the MCP servers, the skill and plugin
 * sources and telemetry need no entry. The CRD takes an HTTP(S) origin such as
 * `https://proxy.golang.org` or `https://github.com:443`, or a TLS service by
 * host and required port, such as `tls://db.example.com:5432`, which the egress
 * gateway forwards without decrypting it. The host may carry `*` as its
 * leftmost label (`https://*.githubusercontent.com`), which matches exactly one
 * label and needs two labels under it. Nothing opens every host.
 */
export const MAX_EGRESS_ORIGINS = 64;
export const MAX_EGRESS_ORIGIN_LENGTH = 270;

const LABEL = '[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?';
const HOST = `(\\*\\.(${LABEL}\\.)+|(${LABEL}\\.)*)[a-z]([-a-z0-9]{0,61}[a-z0-9])?`;
const PORT =
  '[1-9][0-9]{0,3}|[1-5][0-9]{4}|6[0-4][0-9]{3}|65[0-4][0-9]{2}|655[0-2][0-9]|6553[0-5]';

/** The CRD's `items.pattern` for `spec.egress`. */
export const EGRESS_ORIGIN_PATTERN = new RegExp(
  `^(https?://${HOST}(:(${PORT}))?|tls://${HOST}:(${PORT}))$`,
);

/**
 * One entry's parts, with the port optional for every scheme, so a `tls://`
 * entry without one is refused for that reason rather than as no origin.
 */
const ORIGIN_PARTS = new RegExp(
  `^(?<scheme>https?|tls)://(?<host>${HOST})(:(?<port>${PORT}))?$`,
);

/** The port an origin without one reaches. */
const DEFAULT_PORTS: Record<string, string> = { http: '80', https: '443' };

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

/**
 * Why the egress list cannot be sent, or undefined when it can: what the CRD
 * and kagent's compiler refuse, in agent-manager's words.
 */
export function egressProblem(origins: readonly string[]): string | undefined {
  if (origins.length > MAX_EGRESS_ORIGINS) {
    return `${origins.length} egress origins; the limit is ${MAX_EGRESS_ORIGINS}`;
  }
  const seen = new Set<string>();
  // The protocol each host pattern and port is reached over.
  const protocols = new Map<string, string>();
  for (const origin of origins) {
    if (origin.length > MAX_EGRESS_ORIGIN_LENGTH) {
      return `Egress origin "${shorten(origin)}" is longer than ${MAX_EGRESS_ORIGIN_LENGTH} characters`;
    }
    const parts = ORIGIN_PARTS.exec(origin)?.groups;
    if (!parts) {
      return `Egress origin "${shorten(origin)}" is not an egress origin: give http(s)://<host>[:<port>], such as https://github.com:443 or https://*.githubusercontent.com, or tls://<host>:<port>, such as tls://db.example.com:5432 (lowercase host, no path)`;
    }
    const { scheme, host } = parts;
    if (!parts.port && scheme === 'tls') {
      return `Egress origin "${shorten(origin)}" has no port: a tls:// origin requires one, such as tls://db.example.com:5432`;
    }
    if (seen.has(origin)) {
      return `Egress origin "${origin}" is listed twice`;
    }
    seen.add(origin);
    const key = `${host}:${parts.port || DEFAULT_PORTS[scheme]}`;
    const other = protocols.get(key);
    if (other && other !== scheme) {
      return `Egress origin "${shorten(origin)}" reaches ${key} over ${scheme}, which another entry reaches over ${other}: a host pattern and port take one protocol`;
    }
    protocols.set(key, scheme);
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
