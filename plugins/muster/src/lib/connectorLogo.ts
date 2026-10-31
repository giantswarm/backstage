/**
 * Which logo a connector shows: the icon muster read from the MCP server
 * itself, else the platform's mark for the service its URL points at, else
 * none (the letter tile). Pure, so every rule is testable without a DOM.
 */

/** The brands the platform ships a mark for. */
export const CONNECTOR_BRANDS = [
  'atlassian',
  'aws',
  'confluence',
  'datadog',
  'github',
  'gitlab',
  'googledrive',
  'grafana',
  'jira',
  'kubernetes',
  'linear',
  'miro',
  'notion',
  'pagerduty',
  'sentry',
] as const;
export type ConnectorBrand = (typeof CONNECTOR_BRANDS)[number];

/**
 * How a URL is matched to a brand; every field a rule sets must match.
 * `domains` match the host or any subdomain of it; `labels`, one dash- or
 * dot-separated word of the host, for self-hosted services
 * (`jira.example.com`, `mcp-grafana.corp`); `path`, a prefix of the path,
 * where one host serves several services.
 */
type BrandRule = {
  brand: ConnectorBrand;
  domains?: string[];
  labels?: string[];
  path?: string;
};

/** First match wins: the specific products before the vendor's domain. */
const BRAND_RULES: BrandRule[] = [
  { brand: 'jira', labels: ['jira'] },
  { brand: 'confluence', labels: ['confluence'] },
  { brand: 'atlassian', domains: ['atlassian.com', 'atlassian.net'] },
  { brand: 'pagerduty', domains: ['pagerduty.com'] },
  { brand: 'github', domains: ['github.com', 'githubcopilot.com'] },
  { brand: 'github', labels: ['github'] },
  { brand: 'gitlab', labels: ['gitlab'] },
  { brand: 'googledrive', domains: ['drive.google.com'] },
  { brand: 'googledrive', domains: ['googleapis.com'], labels: ['drive'] },
  { brand: 'googledrive', domains: ['googleapis.com'], path: '/drive' },
  { brand: 'grafana', domains: ['grafana.net'] },
  { brand: 'grafana', labels: ['grafana'] },
  { brand: 'notion', domains: ['notion.com', 'notion.so'] },
  { brand: 'linear', domains: ['linear.app'] },
  { brand: 'sentry', domains: ['sentry.io'] },
  {
    brand: 'datadog',
    domains: ['datadoghq.com', 'datadoghq.eu', 'ddog-gov.com'],
  },
  { brand: 'miro', domains: ['miro.com'] },
  { brand: 'aws', domains: ['api.aws', 'amazonaws.com'] },
  { brand: 'kubernetes', labels: ['kubernetes', 'k8s'] },
];

/** The icon formats muster passes on, as base64 `data:` URIs only. */
const ICON_PATTERN =
  /^data:image\/(?:svg\+xml|png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

/** muster's 64 KiB cap, base64-encoded, plus the longest prefix. */
const MAX_ICON_LENGTH = Math.ceil((64 * 1024) / 3) * 4 + 32;

/**
 * The MCPServer's `.status.icon` when it is safe to put in an `<img>`: a
 * base64 `data:` URI of an SVG, PNG, JPEG or WebP image within muster's cap.
 */
export function connectorIconOf(icon: unknown): string | undefined {
  return typeof icon === 'string' &&
    icon.length <= MAX_ICON_LENGTH &&
    ICON_PATTERN.test(icon)
    ? icon
    : undefined;
}

function matches(rule: BrandRule, host: string, path: string): boolean {
  const domain =
    !rule.domains ||
    rule.domains.some(d => host === d || host.endsWith(`.${d}`));
  const label =
    !rule.labels || host.split(/[.-]/).some(l => rule.labels!.includes(l));
  const prefix = !rule.path || path.startsWith(rule.path);
  return domain && label && prefix;
}

/** The brand of the service a connector's URL points at, by its host. */
export function connectorBrandOf(
  url: string | undefined,
): ConnectorBrand | undefined {
  if (!url) {
    return undefined;
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
  const path = parsed.pathname.toLowerCase();
  return BRAND_RULES.find(rule => matches(rule, host, path))?.brand;
}

/** What a connector's logo is resolved from: its MCPServer's icon and URL. */
export type ConnectorLogoSource = {
  /** `.status.icon`, the icon muster read from the server. */
  icon?: string;
  /** `.spec.url`; a stdio server has none. */
  url?: string;
};

export type ConnectorLogoResolution =
  { kind: 'image'; src: string } | { kind: 'brand'; brand: ConnectorBrand };

/**
 * The server's own icon, else the platform's brand mark for its URL, else
 * `null` for the letter tile.
 */
export function resolveConnectorLogo(
  source: ConnectorLogoSource | undefined,
): ConnectorLogoResolution | null {
  const src = connectorIconOf(source?.icon);
  if (src) {
    return { kind: 'image', src };
  }
  const brand = connectorBrandOf(source?.url);
  return brand ? { kind: 'brand', brand } : null;
}
