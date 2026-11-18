import { usageServerNames } from '../components/ConnectorPage/utils/connectorUsage';
import { MCPServer } from './k8s';
import {
  connectorAuthName,
  connectorToolNamePrefix,
  isOrganizationServer,
  musterNamespaceOf,
  withMusterKeys,
} from './connectorKey';
import { serverListRows } from './serverList';
import { connectorPageKeys, findServerRow } from './serverGrouping';
import {
  serverPageResolver,
  serverPrefixInfos,
  toolsForRow,
} from './toolGrouping';

function server(
  name: string,
  namespace: string,
  displayName?: string,
  spec: Record<string, unknown> = {},
): MCPServer {
  return new MCPServer(
    {
      apiVersion: 'muster.giantswarm.io/v1alpha1',
      kind: 'MCPServer',
      metadata: {
        name,
        namespace,
        ...(displayName
          ? { annotations: { 'ui.giantswarm.io/display-name': displayName } }
          : {}),
      },
      spec: {
        type: 'streamable-http',
        url: `https://${name}.example.test`,
        ...spec,
      },
    } as never,
    'gazelle',
  );
}

const gazelleWiki = server('wiki', 'org-gazelle', 'Gazelle wiki');
const golemWiki = server('wiki', 'org-golem', 'Golem wiki');
const github = server('github', 'agent-platform');

describe('connector keys', () => {
  it("names a server as muster keys it: its name in muster's namespace, <namespace>/<name> in an organization's", () => {
    expect(connectorAuthName(github)).toBe('github');
    expect(connectorAuthName(gazelleWiki)).toBe('org-gazelle/wiki');
    expect(isOrganizationServer(github)).toBe(false);
    expect(isOrganizationServer(gazelleWiki)).toBe(true);
    expect(connectorToolNamePrefix(github)).toBe('x_github');
    expect(connectorToolNamePrefix(gazelleWiki)).toBe('x_org-gazelle_wiki');
  });

  describe('two organizations owning a server of one name', () => {
    const servers = [github, gazelleWiki, golemWiki];

    it('lists each as a row of its own key, by its own display name', () => {
      const rows = serverListRows(servers, [
        { name: 'x_org-gazelle_wiki_search' },
        { name: 'x_org-golem_wiki_search' },
        { name: 'x_org-golem_wiki_read' },
      ] as never);
      const wikis = rows.filter(row => row.id === 'wiki');
      expect(wikis.map(row => row.key)).toEqual([
        'server:org-gazelle/wiki',
        'server:org-golem/wiki',
      ]);
      expect(wikis.map(row => row.displayName)).toEqual([
        'Gazelle wiki',
        'Golem wiki',
      ]);
      expect(wikis.map(row => row.tools?.length)).toEqual([1, 2]);
      // The `:server` segment `wiki` cannot tell them apart.
      expect(wikis.map(row => row.shadowed)).toEqual([true, true]);
      expect(new Set(rows.map(row => row.key)).size).toBe(rows.length);
    });

    it('attributes each tool to its own server', () => {
      const prefixes = serverPrefixInfos(servers);
      const tools = [
        { name: 'x_org-gazelle_wiki_search' },
        { name: 'x_org-golem_wiki_search' },
      ] as never;
      expect(
        toolsForRow(tools, { kind: 'server', server: golemWiki }, prefixes).map(
          tool => tool.name,
        ),
      ).toEqual(['x_org-golem_wiki_search']);
    });

    it('opens no page for either by the shared name, nor a page of the other', () => {
      expect(findServerRow(servers, 'wiki')).toBeUndefined();
      expect(serverPageResolver(servers)('x_org-golem_wiki_search')).toBe(
        undefined,
      );
      const pages = connectorPageKeys(servers);
      expect(pages.get('github')).toBe('github');
      expect(pages.has('org-gazelle/wiki')).toBe(false);
      expect(pages.has('org-golem/wiki')).toBe(false);
    });

    it('reads the usage of each by its own key', () => {
      expect(usageServerNames({ kind: 'server', server: gazelleWiki })).toEqual(
        ['org-gazelle/wiki'],
      );
    });
  });

  it("gives an organization's server the page of its name while it is the only one of that name", () => {
    const servers = [github, gazelleWiki];
    expect(findServerRow(servers, 'wiki')).toEqual({
      kind: 'server',
      server: gazelleWiki,
    });
    expect(connectorPageKeys(servers).get('org-gazelle/wiki')).toBe('wiki');
    expect(serverPageResolver(servers)('x_org-gazelle_wiki_search')).toBe(
      'wiki',
    );
  });

  it("gives the page of a name to muster's own server over an organization's", () => {
    const own = server('wiki', 'agent-platform');
    const servers = [gazelleWiki, own];
    expect(findServerRow(servers, 'wiki')).toEqual({
      kind: 'server',
      server: own,
    });
    expect(serverPageResolver(servers)('x_wiki_search')).toBe('wiki');
    expect(serverPageResolver(servers)('x_org-gazelle_wiki_search')).toBe(
      undefined,
    );
  });

  it('counts an empty toolPrefix as none, as muster does', () => {
    expect(
      connectorToolNamePrefix(
        server('wiki', 'org-gazelle', undefined, { toolPrefix: '' }),
      ),
    ).toBe('x_org-gazelle_wiki');
  });

  it("names an organization's server named like a family by its own display name", () => {
    const member = server('gazelle-mcp-wiki', 'agent-platform', 'Wiki', {
      family: { name: 'wiki' },
    });
    const rows = serverListRows([member, gazelleWiki], undefined);
    expect(
      rows.filter(row => row.row.kind !== 'core').map(row => row.displayName),
    ).toEqual(['Wiki', 'Gazelle wiki']);
  });

  describe("a muster running outside the chart's namespace", () => {
    const own = server('github', 'muster-system');
    const ownToo = server('jira', 'muster-system');
    const org = server('wiki', 'org-gazelle');
    // muster's `/servers/names`: its own servers by name, the others by key.
    const names = new Set(['github', 'jira', 'org-gazelle/wiki']);

    it('reads its namespace from the names muster gives its servers', () => {
      expect(musterNamespaceOf([own, ownToo, org], names)).toBe(
        'muster-system',
      );
    });

    it("keys, prefixes and lists its servers as its own, an organization's as before", () => {
      const keyed = withMusterKeys([own, ownToo, org], () => names);
      expect(keyed.map(connectorAuthName)).toEqual([
        'github',
        'jira',
        'org-gazelle/wiki',
      ]);
      expect(keyed.map(isOrganizationServer)).toEqual([false, false, true]);
      expect(connectorToolNamePrefix(keyed[0])).toBe('x_github');

      const rows = serverListRows(keyed, [
        { name: 'x_github_get_issue' },
        { name: 'x_org-gazelle_wiki_search' },
      ] as never);
      const ownRow = rows.find(row => row.id === 'github')!;
      expect(ownRow.key).toBe('server:github');
      expect(ownRow.tools?.map(t => t.tool.name)).toEqual([
        'x_github_get_issue',
      ]);
      expect(ownRow.shadowed).toBe(false);
      expect(findServerRow(keyed, 'github')).toEqual({
        kind: 'server',
        server: keyed[0],
      });
    });

    it('keeps the servers of an installation muster has not answered for', () => {
      const [unkeyed] = withMusterKeys([own], () => undefined);
      expect(unkeyed).toBe(own);
    });
  });
});
