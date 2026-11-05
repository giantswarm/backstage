import {
  MCPServer,
  type ToolSummary,
} from '@giantswarm/backstage-plugin-muster';

import { buildCatalogue, connectorOfTool } from '../lib/toolset';
import { connectorsForTenant, serverInfoOf } from './useMusterServers';

function mcpServer(namespace: string, name: string, state = 'Connected') {
  return new MCPServer(
    {
      apiVersion: 'muster.giantswarm.io/v1alpha1',
      kind: 'MCPServer',
      metadata: { name, namespace },
      spec: { type: 'streamable-http' },
      status: { state },
    } as never,
    'gazelle',
  );
}

function withAuth(auth: Record<string, unknown> | undefined) {
  return new MCPServer(
    {
      apiVersion: 'muster.giantswarm.io/v1alpha1',
      kind: 'MCPServer',
      metadata: { name: 'grafana-cloud', namespace: 'muster' },
      spec: { type: 'streamable-http', auth },
    } as never,
    'gazelle',
  );
}

describe('serverInfoOf', () => {
  // muster's core_auth_login signs a session in to an OAuth server, per
  // session or with a person's `subject` grant, and refuses an SSO server it
  // connects with the caller's own token.
  it.each([
    ['per-session OAuth', { type: 'oauth' }, true],
    [
      'a subject grant',
      {
        type: 'oauth',
        authorizationServer: {
          issuer: 'https://idp.example.com',
          grantScope: 'subject',
        },
      },
      true,
    ],
    ['forwarded token', { type: 'oauth', forwardToken: true }, false],
    [
      'token exchange',
      {
        type: 'oauth',
        tokenExchange: {
          enabled: true,
          dexTokenEndpoint: 'https://dex.example.com/token',
          connectorId: 'example',
        },
      },
      false,
    ],
    ['sigv4', { type: 'sigv4', sigv4: { region: 'eu-central-1' } }, false],
    ['no auth', undefined, false],
  ])(
    'says whether %s signs in through the sign-in tool',
    (_, auth, expected) => {
      expect(serverInfoOf(withAuth(auth)).signInTool).toBe(expected);
    },
  );

  // muster keys an organization's server `<namespace>/<name>` and reports that
  // key as its tools' `server`; a server of muster's namespace keeps its name.
  it("puts an organization's server's tools on its own tile, apart from a shared server of the same name", () => {
    const servers = [
      mcpServer('agent-platform', 'deepwiki'),
      mcpServer('org-a', 'deepwiki', 'Auth Required'),
    ].map(serverInfoOf);

    const registered = buildCatalogue(
      [
        { name: 'x_deepwiki_ask', server: 'deepwiki', kind: 'tool' },
        {
          name: 'x_org-a_deepwiki_ask',
          server: 'org-a/deepwiki',
          kind: 'tool',
        },
      ],
      servers,
      [],
    ).flatMap(group => group.servers);

    expect(
      registered.map(({ name, tools, unknownServer, needsSignIn, state }) => ({
        name,
        tools: tools.map(tool => tool.name),
        unknownServer,
        needsSignIn,
        state,
      })),
    ).toEqual([
      {
        name: 'deepwiki',
        tools: ['x_deepwiki_ask'],
        unknownServer: false,
        needsSignIn: false,
        state: 'Connected',
      },
      {
        name: 'org-a/deepwiki',
        tools: ['x_org-a_deepwiki_ask'],
        unknownServer: false,
        needsSignIn: false,
        state: 'Auth Required',
      },
    ]);
    // Tools named by muster's prefix alone (a session's tool calls) name the
    // same connector.
    expect(connectorOfTool('x_org-a_deepwiki_ask', servers)).toEqual({
      connector: 'org-a/deepwiki',
      tool: 'ask',
    });
  });
});

describe('serverInfoOf tags', () => {
  it('carries the tags of a tagged server and none otherwise', () => {
    const tagged = new MCPServer(
      {
        apiVersion: 'muster.giantswarm.io/v1alpha1',
        kind: 'MCPServer',
        metadata: {
          name: 'jira',
          namespace: 'muster',
          annotations: { 'ui.giantswarm.io/tags': 'ticketing,ops' },
        },
        spec: { type: 'streamable-http' },
      } as never,
      'gazelle',
    );
    expect(serverInfoOf(tagged).tags).toEqual(['ticketing', 'ops']);
    expect(serverInfoOf(mcpServer('muster', 'github'))).not.toHaveProperty(
      'tags',
    );
  });
});

describe('connectorsForTenant', () => {
  const servers = [
    serverInfoOf(mcpServer('muster', 'github')),
    serverInfoOf(mcpServer('org-acme', 'jira')),
    serverInfoOf(mcpServer('org-beta', 'jira')),
  ];
  const tools = [
    { name: 'x_github_list_issues' },
    { name: 'x_org-acme_jira_search' },
    { name: 'x_org-beta_jira_search' },
  ] as ToolSummary[];

  it("offers an agent the shared connectors and its own namespace's, never another's", () => {
    const offered = connectorsForTenant(servers, tools, 'org-acme');

    expect(offered.servers.map(server => server.name)).toEqual([
      'github',
      'org-acme/jira',
    ]);
    expect(offered.tools.map(tool => tool.name)).toEqual([
      'x_github_list_issues',
      'x_org-acme_jira_search',
    ]);
  });

  it('offers every connector while the agent has no namespace yet', () => {
    expect(connectorsForTenant(servers, tools, undefined).servers).toHaveLength(
      3,
    );
  });
});
