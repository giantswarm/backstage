import type { ToolSummary } from '@giantswarm/backstage-plugin-muster';

import type { CatalogueGroup, ServerBucket } from '../../lib/toolset';
import {
  ACCESS_CHAT_ONLY,
  ACCESS_OWN_PICKS,
  accessLevelOf,
  compactSelection,
  connectorState,
  expandSelection,
  inlineCapProblem,
  presetBaseOf,
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

describe('a compact toolset (B1)', () => {
  const GITHUB = bucket('github', [
    changes('x_github_merge'),
    changes('x_github_pr'),
  ]);
  const DOCS = bucket('docs', [reads('x_docs_get'), reads('x_docs_find')]);
  const groups: CatalogueGroup[] = [
    {
      key: 'registered',
      title: 'Registered servers',
      servers: [JIRA, GITHUB, DOCS],
      platformAdministration: [],
      workflows: [],
    },
  ];
  const triage: ToolSummary = {
    name: 'workflow_triage',
    kind: 'workflow',
    annotations: { readOnlyHint: true },
  };
  // What `preset:read-only` resolves to here.
  const readOnly = [...JIRA.tools, ...DOCS.tools, triage].filter(
    tool => tool.annotations?.readOnlyHint,
  );
  const base = { preset: 'preset:read-only', resolved: readOnly };
  const coverage = materialize(readOnly, groups);

  it('builds on one offered preset, alone or with more beside it', () => {
    expect(presetBaseOf(['preset:read-only'], OFFERED)).toBe(
      'preset:read-only',
    );
    expect(presetBaseOf(['preset:read-only', 'server:github'], OFFERED)).toBe(
      'preset:read-only',
    );
    expect(presetBaseOf(['preset:read-only', 'preset:infra'], OFFERED)).toBe(
      undefined,
    );
    expect(presetBaseOf(['preset:mine', 'server:github'], OFFERED)).toBe(
      undefined,
    );
    expect(presetBaseOf(['preset:full'], OFFERED)).toBe(undefined);
    expect(presetBaseOf(['server:github'], OFFERED)).toBe(undefined);
  });

  it('shows a preset with more beside it as the preset written out plus that', () => {
    const shown = expandSelection(
      coverage,
      ['server:jira', 'tool:x_github_pr', 'tool:x_docs_get'],
      groups,
    );
    expect(shown).toEqual([
      'tool:x_docs_get',
      'tool:x_docs_find',
      'workflow:triage',
      'server:jira',
      'tool:x_github_pr',
    ]);
    const selected = new Set(shown);
    expect(connectorState(JIRA, selected).choice).toBe('all');
    expect(connectorState(DOCS, selected).choice).toBe('read-only');
    expect(connectorState(GITHUB, selected).choice).toBe('partial');
  });

  it('keeps the preset as the base while everything it covers is chosen', () => {
    // Read-only everywhere plus all of jira: the QA repro's shape.
    const allJira = withConnectorChoice(coverage, JIRA, 'all');
    expect(compactSelection(allJira, base, groups)).toEqual([
      'preset:read-only',
      'server:jira',
    ]);
    // Plus one tool picked by hand.
    expect(
      compactSelection([...allJira, 'tool:x_github_pr'], base, groups),
    ).toEqual(['preset:read-only', 'server:jira', 'tool:x_github_pr']);
    // Exactly what it covers: the preset alone.
    expect(compactSelection(coverage, base, groups)).toEqual([
      'preset:read-only',
    ]);
    // And a toolset built that way shows as it was chosen.
    expect(expandSelection(coverage, ['server:jira'], groups).sort()).toEqual(
      [...allJira].sort(),
    );
  });

  it('writes the selection out when part of the preset is taken away', () => {
    // "Read-only minus docs" has no selector.
    const withoutDocs = withConnectorChoice(coverage, DOCS, 'none');
    expect(compactSelection(withoutDocs, base, groups)).toEqual(withoutDocs);
    // No preset to build on: the selection as it is.
    expect(compactSelection(['server:jira'], undefined, groups)).toEqual([
      'server:jira',
    ]);
    // Full gateway stands alone.
    expect(compactSelection(['preset:full'], base, groups)).toEqual([
      'preset:full',
    ]);
  });

  it('drops a preset that saves nothing', () => {
    const nothing = { preset: 'preset:infra', resolved: [] };
    expect(compactSelection(['server:jira'], nothing, groups)).toEqual([
      'server:jira',
    ]);
  });

  it('names what to reduce over the cap', () => {
    const many = (prefix: string, count: number) =>
      Array.from({ length: count }, (_, i) => `tool:x_${prefix}_${i}`);
    const wide: CatalogueGroup[] = [
      {
        key: 'registered',
        title: 'Registered servers',
        servers: [
          bucket(
            'jira',
            many('jira', 20).map(selector => reads(selector.slice(5))),
          ),
          bucket(
            'github',
            many('github', 12).map(selector => reads(selector.slice(5))),
          ),
        ],
        platformAdministration: [],
        workflows: [],
      },
    ];
    expect(
      inlineCapProblem(
        [
          'preset:read-only',
          ...many('jira', 20),
          ...many('github', 12),
          'workflow:a',
          'workflow:b',
          'server:docs',
        ],
        wide,
      ),
    ).toBe(
      'This toolset needs 36 selectors but may list at most 32; most come from jira (20), github (12) and workflows (2), so choose All or fewer tools there.',
    );
    // Selectors naming nothing listed are named as such.
    expect(
      inlineCapProblem(
        Array.from({ length: 33 }, (_, i) => `server:s${i}`),
        wide,
      ),
    ).toBe(
      'This toolset needs 33 selectors but may list at most 32; most come from other selectors (33), so choose All or fewer tools there.',
    );
    // One selector per connector: nothing stands out.
    const singles: CatalogueGroup[] = [
      {
        ...wide[0],
        servers: Array.from({ length: 33 }, (_, i) =>
          bucket(`s${i}`, [reads(`x_s${i}_get`)]),
        ),
      },
    ];
    expect(
      inlineCapProblem(
        Array.from({ length: 33 }, (_, i) => `server:s${i}`),
        singles,
      ),
    ).toBe(
      'This toolset needs 33 selectors but may list at most 32, so choose fewer connectors or tools.',
    );
  });
});
