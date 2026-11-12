import type { CatalogueGroup, ServerBucket } from '../../lib/toolset';
import { groupSummary, serverSummary } from './ToolCatalogue';

function bucket(name: string, extra: Partial<ServerBucket> = {}): ServerBucket {
  return {
    name,
    isFamily: false,
    tools: [],
    needsSignIn: false,
    canSignIn: false,
    unknownServer: false,
    ...extra,
  };
}

const tool = (name: string) =>
  ({ name, description: '' }) as ServerBucket['tools'][number];

function group(servers: ServerBucket[]): CatalogueGroup {
  return {
    key: 'registered',
    title: 'Registered connectors',
    servers,
    platformAdministration: [],
    workflows: [],
  };
}

describe('serverSummary', () => {
  it('names a connector’s connection instead of 0 tools', () => {
    expect(serverSummary(bucket('jira', { connection: 'not-connected' }))).toBe(
      'not connected, no tools listed',
    );
    expect(serverSummary(bucket('jira', { connection: 'deactivated' }))).toBe(
      'deactivated, no tools listed',
    );
    expect(serverSummary(bucket('k8s', { connection: 'partial' }))).toBe(
      'partly connected, no tools listed',
    );
  });

  it('counts the tools of a connected one, and asks for a sign-in', () => {
    expect(serverSummary(bucket('jira'))).toBe('0 tools');
    expect(
      serverSummary(
        bucket('jira', {
          connection: 'not-connected',
          tools: [tool('x_jira_search')],
        }),
      ),
    ).toBe('1 tool');
    expect(
      serverSummary(
        bucket('jira', { needsSignIn: true, connection: 'not-connected' }),
      ),
    ).toBe('sign in to see its tools');
  });
});

describe('groupSummary', () => {
  it('counts the connectors not connected instead of saying 0 tools', () => {
    expect(
      groupSummary(
        group([
          bucket('docs', { connection: 'deactivated' }),
          bucket('jira', { connection: 'not-connected' }),
          bucket('wiki', { connection: 'not-connected' }),
        ]),
        new Set(),
      ),
    ).toBe('3 connectors · 2 not connected · 1 deactivated');
  });

  it('keeps the tool count while some connector could list tools', () => {
    expect(
      groupSummary(
        group([
          bucket('jira', { connection: 'not-connected' }),
          bucket('wiki'),
        ]),
        new Set(),
      ),
    ).toBe('2 connectors · 0 tools · 1 not connected');
    expect(
      groupSummary(
        group([
          bucket('jira', { connection: 'not-connected' }),
          bucket('wiki', { tools: [tool('x_wiki_get')] }),
        ]),
        new Set(),
      ),
    ).toBe('2 connectors · 1 tool · 1 not connected');
  });
});
