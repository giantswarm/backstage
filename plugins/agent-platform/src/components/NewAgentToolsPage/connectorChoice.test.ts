import type { ToolSummary } from '@giantswarm/backstage-plugin-muster';

import type { CatalogueGroup, ServerBucket } from '../../lib/toolset';
import {
  ACCESS_CHAT_ONLY,
  ACCESS_OWN_PICKS,
  accessLevelOf,
  connectorState,
  railGroups,
  railToolLabel,
  readOnlyFits,
  readOnlySelectors,
  materialize,
  withConnectorChoice,
} from './connectorChoice';

const reads = (name: string): ToolSummary => ({
  name,
  kind: 'tool',
  annotations: { readOnlyHint: true },
});
const changes = (name: string): ToolSummary => ({ name, kind: 'tool' });

function bucket(name: string, tools: ToolSummary[]): ServerBucket {
  return {
    name,
    isFamily: false,
    tools,
    needsSignIn: false,
    canSignIn: false,
    unknownServer: false,
  };
}

const JIRA = bucket('jira', [
  reads('x_jira_get_issue'),
  reads('x_jira_search'),
  changes('x_jira_create_issue'),
]);

const OFFERED = new Set(['preset:read-only', 'preset:infra', 'preset:full']);

describe('the access level', () => {
  it('reads an offered preset alone as that preset, and anything else as own picks', () => {
    expect(accessLevelOf(['preset:read-only'], false, OFFERED)).toBe(
      'preset:read-only',
    );
    // A preset with more beside it (the T81 shape) is shown as own picks.
    expect(
      accessLevelOf(['preset:read-only', 'server:x'], false, OFFERED),
    ).toBe(ACCESS_OWN_PICKS);
    expect(accessLevelOf(['server:x'], false, OFFERED)).toBe(ACCESS_OWN_PICKS);
    expect(accessLevelOf([], false, OFFERED)).toBe(ACCESS_OWN_PICKS);
    // Several presets, or one not offered, cannot be a radio's answer.
    expect(
      accessLevelOf(['preset:read-only', 'preset:infra'], false, OFFERED),
    ).toBe(ACCESS_OWN_PICKS);
    expect(accessLevelOf(['preset:mine'], false, OFFERED)).toBe(
      ACCESS_OWN_PICKS,
    );
    expect(accessLevelOf([], true, OFFERED)).toBe(ACCESS_CHAT_ONLY);
  });
});

describe('a connector’s choice', () => {
  it('enumerates the read-only tools as tool selectors', () => {
    expect(readOnlySelectors(JIRA)).toEqual([
      'tool:x_jira_get_issue',
      'tool:x_jira_search',
    ]);
    expect(readOnlyFits(JIRA)).toBe(true);
    const huge = bucket(
      'huge',
      Array.from({ length: 40 }, (_, i) => reads(`x_huge_${i}`)),
    );
    expect(readOnlyFits(huge)).toBe(false);
  });

  it('reads all, read-only, partial and none honestly', () => {
    expect(connectorState(JIRA, new Set(['server:jira']))).toEqual({
      choice: 'all',
      picked: 0,
    });
    expect(
      connectorState(
        JIRA,
        new Set(['tool:x_jira_get_issue', 'tool:x_jira_search']),
      ),
    ).toEqual({ choice: 'read-only', picked: 2 });
    // One read-only tool short, or a write tool on top: neither option.
    expect(
      connectorState(JIRA, new Set(['tool:x_jira_get_issue'])).choice,
    ).toBe('partial');
    expect(
      connectorState(
        JIRA,
        new Set([
          'tool:x_jira_get_issue',
          'tool:x_jira_search',
          'tool:x_jira_create_issue',
        ]),
      ),
    ).toEqual({ choice: 'partial', picked: 3 });
    expect(connectorState(JIRA, new Set(['preset:read-only'])).choice).toBe(
      'none',
    );
  });

  it('replaces what named the connector, and takes exactly that back', () => {
    const start = ['preset:read-only', 'tool:x_jira_create_issue', 'server:x'];
    const readOnly = withConnectorChoice(start, JIRA, 'read-only');
    expect(readOnly).toEqual([
      'preset:read-only',
      'server:x',
      'tool:x_jira_get_issue',
      'tool:x_jira_search',
    ]);
    const all = withConnectorChoice(readOnly, JIRA, 'all');
    expect(all).toEqual(['preset:read-only', 'server:x', 'server:jira']);
    expect(withConnectorChoice(all, JIRA, 'none')).toEqual([
      'preset:read-only',
      'server:x',
    ]);
    // Full gateway gives way to a pick, as everywhere.
    expect(withConnectorChoice(['preset:full'], JIRA, 'all')).toEqual([
      'server:jira',
    ]);
  });
});

describe('the Selected rail', () => {
  const groups: CatalogueGroup[] = [
    {
      key: 'registered',
      title: 'Registered servers',
      servers: [JIRA, bucket('github', [changes('x_github_merge')])],
      platformAdministration: [{ name: 'core_service_list', kind: 'core' }],
      workflows: [],
    },
  ];

  it('groups the selection by connector, presets first and the unknown last', () => {
    expect(
      railGroups(
        [
          'workflow:triage',
          'tool:x_jira_search',
          'server:github',
          'preset:read-only',
          'tool:core_service_list',
          'server:gone',
          'tool:x_jira_get_issue',
        ],
        groups,
      ),
    ).toEqual([
      { key: 'presets', title: 'Access', selectors: ['preset:read-only'] },
      {
        key: 'connector:github',
        title: 'github',
        whole: 'server:github',
        selectors: [],
      },
      {
        key: 'connector:jira',
        title: 'jira',
        selectors: ['tool:x_jira_search', 'tool:x_jira_get_issue'],
      },
      { key: 'workflows', title: 'Workflows', selectors: ['workflow:triage'] },
      {
        key: 'platform-administration',
        title: 'Platform administration',
        selectors: ['tool:core_service_list'],
      },
      { key: 'other', title: 'Other', selectors: ['server:gone'] },
    ]);
  });

  it('names a tool without its connector prefix', () => {
    expect(railToolLabel('tool:x_jira_search', 'jira')).toBe('search');
    expect(railToolLabel('tool:core_service_list')).toBe('core_service_list');
    expect(railToolLabel('workflow:triage')).toBe('triage');
    expect(railToolLabel('server:gone')).toBe('server:gone');
  });
});

describe('a preset written out', () => {
  const groups: CatalogueGroup[] = [
    {
      key: 'registered',
      title: 'Registered servers',
      servers: [
        JIRA,
        bucket('github', [changes('x_github_merge'), changes('x_github_pr')]),
        bucket('docs', [reads('x_docs_get'), reads('x_docs_find')]),
      ],
      platformAdministration: [],
      workflows: [],
    },
  ];
  const tool = (name: string) =>
    [...JIRA.tools, ...groups[0].servers.flatMap(b => b.tools)].find(
      t => t.name === name,
    )!;

  it('shows each connector as read-only, all or the tools it covers, then the rest', () => {
    expect(
      materialize(
        [
          tool('x_jira_get_issue'),
          tool('x_jira_search'),
          tool('x_github_merge'),
          tool('x_github_pr'),
          tool('x_docs_get'),
          { name: 'workflow_triage', kind: 'workflow' },
          { name: 'x_unknown_thing', kind: 'tool' },
        ],
        groups,
      ),
    ).toEqual([
      // docs: only read-only tools, all of them covered — Read-only, not All.
      'tool:x_docs_get',
      'server:github',
      'tool:x_jira_get_issue',
      'tool:x_jira_search',
      'workflow:triage',
      'tool:x_unknown_thing',
    ]);
  });

  it('covers part of a connector as those tools, which reads as partial', () => {
    const written = materialize([tool('x_jira_create_issue')], groups);
    expect(written).toEqual(['tool:x_jira_create_issue']);
    expect(connectorState(JIRA, new Set(written)).choice).toBe('partial');
  });
});
