import { MCPServer } from '@giantswarm/backstage-plugin-muster';

import { buildCatalogue } from '../lib/toolset';
import { serverInfoOf } from './useMusterServers';

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

describe('serverInfoOf', () => {
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
  });
});
