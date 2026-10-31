import {
  connectorBrandOf,
  connectorIconOf,
  resolveConnectorLogo,
} from './connectorLogo';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const SVG = 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=';

describe('resolveConnectorLogo', () => {
  it("prefers the server's own icon over its host's brand", () => {
    expect(
      resolveConnectorLogo({ icon: PNG, url: 'https://github.com/mcp' }),
    ).toEqual({ kind: 'image', src: PNG });
  });

  it("falls back to the brand of the server's host", () => {
    expect(
      resolveConnectorLogo({ url: 'https://mcp.pagerduty.com/mcp' }),
    ).toEqual({ kind: 'brand', brand: 'pagerduty' });
  });

  it('falls back to the brand when the icon is not usable', () => {
    expect(
      resolveConnectorLogo({
        icon: 'https://example.com/icon.png',
        url: 'https://api.githubcopilot.com/mcp/',
      }),
    ).toEqual({ kind: 'brand', brand: 'github' });
  });

  it('is null without an icon or a known host, and for a stdio server', () => {
    expect(resolveConnectorLogo({ url: 'https://mcp.example.com' })).toBeNull();
    expect(resolveConnectorLogo({})).toBeNull();
    expect(resolveConnectorLogo(undefined)).toBeNull();
  });
});

describe('connectorIconOf', () => {
  it.each([
    PNG,
    SVG,
    'data:image/jpeg;base64,/9j/4AAQ',
    'data:image/webp;base64,UklGRg==',
  ])('accepts %s', icon => expect(connectorIconOf(icon)).toBe(icon));

  it.each([
    ['a URL', 'https://example.com/icon.svg'],
    ['a non-image type', 'data:text/html;base64,PGgxPg=='],
    ['an unlisted image type', 'data:image/gif;base64,R0lGODlh'],
    ['a URL-encoded SVG', 'data:image/svg+xml,%3Csvg%3E%3C/svg%3E'],
    ['a payload that is not base64', 'data:image/png;base64,<script>'],
    ['an oversized icon', `data:image/png;base64,${'A'.repeat(100_000)}`],
    ['a non-string', 42],
  ])('rejects %s', (_label, icon) => {
    expect(connectorIconOf(icon)).toBeUndefined();
  });
});

describe('connectorBrandOf', () => {
  it.each([
    ['https://mcp.atlassian.com/v1/sse', 'atlassian'],
    ['https://acme.atlassian.net', 'atlassian'],
    ['https://jira.example.com', 'jira'],
    ['https://confluence.corp.example', 'confluence'],
    ['https://github.com/acme', 'github'],
    ['https://github.example.com/api/mcp', 'github'],
    ['https://gitlab.example.com', 'gitlab'],
    ['https://www.googleapis.com/drive/v3', 'googledrive'],
    ['https://drivemcp.googleapis.com', undefined],
    ['https://drive.googleapis.com/mcp', 'googledrive'],
    ['https://mcp-grafana.corp.example', 'grafana'],
    ['https://mcp.notion.com/mcp', 'notion'],
    ['https://mcp.linear.app/sse', 'linear'],
    ['https://mcp.sentry.io', 'sentry'],
    ['https://mcp.datadoghq.eu', 'datadog'],
    ['https://mcp.miro.com', 'miro'],
    ['https://aws-mcp.eu-central-1.api.aws', 'aws'],
    ['https://mcp-kubernetes.remote.example.test', 'kubernetes'],
    ['https://notgithub.com', undefined],
    ['http://muster.agent-platform.svc.cluster.local', undefined],
    ['not a url', undefined],
    [undefined, undefined],
  ])('%s is %s', (url, brand) => {
    expect(connectorBrandOf(url)).toBe(brand);
  });
});
