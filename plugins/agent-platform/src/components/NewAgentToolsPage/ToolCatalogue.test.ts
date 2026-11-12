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
  it('names a disconnected or failed connector’s state instead of 0 tools', () => {
    expect(serverSummary(bucket('jira', { state: 'Disconnected' }))).toBe(
      'disconnected, no tools listed',
    );
    expect(serverSummary(bucket('jira', { state: 'Failed' }))).toBe(
      'failed, no tools listed',
    );
  });

  it('counts the tools of a connected one, and asks for a sign-in', () => {
    expect(serverSummary(bucket('jira', { state: 'Connected' }))).toBe(
      '0 tools',
    );
    expect(
      serverSummary(bucket('jira', { tools: [tool('x_jira_search')] })),
    ).toBe('1 tool');
    expect(
      serverSummary(bucket('jira', { needsSignIn: true, state: 'Failed' })),
    ).toBe('sign in to see its tools');
  });
});

describe('groupSummary', () => {
  it('counts the connectors not connected instead of saying 0 tools', () => {
    expect(
      groupSummary(
        group([
          bucket('jira', { state: 'Disconnected' }),
          bucket('wiki', { state: 'Failed' }),
        ]),
        new Set(),
      ),
    ).toBe('2 connectors · 2 not connected');
  });

  it('keeps the tool count beside them when others list tools', () => {
    expect(
      groupSummary(
        group([
          bucket('jira', { state: 'Disconnected' }),
          bucket('wiki', { state: 'Connected', tools: [tool('x_wiki_get')] }),
        ]),
        new Set(),
      ),
    ).toBe('2 connectors · 1 tool · 1 not connected');
  });
});
