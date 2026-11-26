// eslint-disable-next-line @backstage/no-mixed-plugin-imports -- Approvals are what muster reports for an agent's tool list.
import type { ToolSummary } from '@giantswarm/backstage-plugin-muster';

import {
  agentToolListOf,
  agentToolsArgumentOf,
  approvalEnforcementOf,
  approvalNotEnforced,
  approvalStateKey,
  connectorAdminFrom,
  reportSummary,
  allowBlocker,
  allowBlockerOfMany,
  approvalDraftOf,
  approvalSummary,
  approvalCounts,
  composeToolList,
  createApprovalSplit,
  droppedExceptions,
  editApprovalPlan,
  exceptionsNote,
  shownSetting,
} from './agentApproval';
import { noApprovalChartRefusal } from './agentManager';

const merge: ToolSummary = {
  name: 'x_github_merge',
  server: 'github',
  kind: 'tool',
  connectorAdmin: false,
  approval: {
    setting: 'ask',
    source: 'tool',
    entry: 'tool:x_github_merge',
    admin: { setting: 'ask', source: 'tool' },
  },
};
const list: ToolSummary = {
  name: 'x_github_list',
  server: 'github',
  kind: 'tool',
  connectorAdmin: false,
  approval: {
    setting: 'allow',
    source: 'tool',
    entry: 'server:github',
    admin: { setting: 'allow', source: 'tool' },
  },
};

describe('agentToolListOf', () => {
  it('reads the tool list from its own field, never the kagent bindings', () => {
    expect(
      agentToolListOf({
        toolSettings: ['server:github', { 'tool:x_github_merge': 'Allow' }],
      }),
    ).toEqual(['server:github', { 'tool:x_github_merge': 'Allow' }]);
    expect(
      agentToolListOf({ toolSettings: [{ server: 'x' }] }),
    ).toBeUndefined();
    expect(agentToolListOf({})).toBeUndefined();
  });

  it('seeds the draft from the stored settings and default', () => {
    expect(
      approvalDraftOf({
        toolSettings: ['server:pd', { 'server:github': 'Ask' }],
        defaultApproval: 'Block',
      }),
    ).toEqual({ settings: { 'server:github': 'Ask' }, default: 'Block' });
  });

  it('reads a not-enforced answer', () => {
    expect(approvalNotEnforced({ approvalEnforced: false })).toBe(true);
    expect(approvalNotEnforced({})).toBe(false);
  });
});

describe('composeToolList', () => {
  const draft = {
    settings: {
      'server:github': 'Ask' as const,
      'tool:x_github_merge': 'Block' as const,
      'server:gone': 'Allow' as const,
    },
  };

  it('writes settings on the selection, then on covered tools', () => {
    expect(
      composeToolList(
        ['server:github', 'server:pd'],
        draft,
        new Set(['tool:x_github_merge']),
      ),
    ).toEqual([
      { 'server:github': 'Ask' },
      'server:pd',
      { 'tool:x_github_merge': 'Block' },
    ]);
  });

  it('never writes a setting that would make an uncovered tool visible', () => {
    expect(composeToolList(['server:pd'], draft, new Set())).toEqual([
      'server:pd',
    ]);
  });
});

describe('createApprovalSplit', () => {
  it("leaves an Allow over a connector's Ask and an allowing default to set_agent_approval", () => {
    expect(
      createApprovalSplit(
        [
          { 'server:github': 'Allow' },
          { 'tool:x_github_merge': 'Allow' },
          { 'server:pd': 'Block' },
        ],
        'Allow',
        [merge, list],
      ),
    ).toEqual({
      tools: [
        { 'server:github': 'Allow' },
        'tool:x_github_merge',
        { 'server:pd': 'Block' },
      ],
      followUp: {
        settings: { 'tool:x_github_merge': 'Allow' },
        default: 'Allow',
      },
    });
  });

  it('takes every Allow as needing a grant without a report', () => {
    expect(
      createApprovalSplit([{ 'server:x': 'Allow' }], 'Ask', undefined),
    ).toEqual({
      tools: ['server:x'],
      default: 'Ask',
      followUp: { settings: { 'server:x': 'Allow' } },
    });
  });
});

describe('editApprovalPlan', () => {
  it('writes changed settings through set_agent_approval when the entries stay', () => {
    expect(
      editApprovalPlan(
        { tools: ['server:github', { 'server:pd': 'Ask' }], default: 'Ask' },
        { tools: [{ 'server:github': 'Block' }, 'server:pd'] },
        [],
      ),
    ).toEqual({
      approval: {
        settings: { 'server:github': 'Block', 'server:pd': '' },
        default: '',
      },
    });
  });

  it("carries a new Allow over a connector's Ask as it stood, then grants it", () => {
    expect(
      editApprovalPlan(
        { tools: ['server:github'] },
        {
          tools: [
            'server:github',
            { 'tool:x_github_merge': 'Allow' },
            { 'server:pd': 'Ask' },
          ],
        },
        [merge],
      ),
    ).toEqual({
      tools: ['server:github', 'tool:x_github_merge', { 'server:pd': 'Ask' }],
      approval: { settings: { 'tool:x_github_merge': 'Allow' } },
    });
  });

  it('changes nothing for an unchanged list', () => {
    expect(
      editApprovalPlan(
        { tools: [{ 'tool:x': 'Allow' }], default: 'Ask' },
        { tools: [{ 'tool:x': 'Allow' }], default: 'Ask' },
        undefined,
      ),
    ).toEqual({});
  });
});

describe('droppedExceptions and exceptionsNote', () => {
  const grants = [
    { entry: 'tool:x_github_merge', server: 'github' },
    { entry: 'server:pd', server: 'pd' },
    { entry: 'default', server: 'jira' },
  ];

  it('drops the grants of connectors the person is no admin of', () => {
    const dropped = droppedExceptions(
      grants,
      {
        tools: [{ 'tool:x_github_merge': 'Allow' }, { 'server:pd': 'Allow' }],
        default: 'Allow',
      },
      server => server === 'pd',
    );
    expect(dropped.notAdmin.map(grant => grant.server)).toEqual([
      'github',
      'jira',
    ]);
    expect(dropped.changed).toEqual([]);
  });

  it('tells a changed entry apart, and a save to git keeps none', () => {
    const dropped = droppedExceptions(
      grants,
      { tools: [{ 'tool:x_github_merge': 'Ask' }, { 'server:pd': 'Allow' }] },
      () => true,
      true,
    );
    expect(dropped.changed.map(grant => grant.entry)).toEqual([
      'tool:x_github_merge',
      'default',
    ]);
    expect(dropped.viaGit.map(grant => grant.entry)).toEqual(['server:pd']);
  });

  it('says what a save removes in the PRD words', () => {
    const labels: Record<string, string> = {
      github: 'GitHub',
      pd: 'PagerDuty',
    };
    expect(
      exceptionsNote([grants[0]], server => labels[server] ?? server),
    ).toBe(
      'Saving removes 1 exception (x_github_merge). A GitHub admin can grant it again.',
    );
    expect(
      exceptionsNote(grants.slice(0, 2), server => labels[server] ?? server),
    ).toBe(
      'Saving removes 2 exceptions (x_github_merge, every PagerDuty tool). A GitHub or PagerDuty admin can grant them again.',
    );
    expect(exceptionsNote([])).toBeUndefined();
  });
});

describe('allowBlocker', () => {
  it("disables Allow over a connector's Ask for someone who is no connector admin", () => {
    expect(allowBlocker(merge, { connectorLabel: 'GitHub' })).toBe(
      'Only GitHub admins can allow this.',
    );
    expect(
      allowBlocker(
        { ...merge, connectorAdmin: true },
        { connectorLabel: 'GitHub' },
      ),
    ).toBeUndefined();
    expect(
      allowBlocker(
        { ...merge, connectorAdmin: true },
        { connectorLabel: 'GitHub', viaGit: true },
      ),
    ).toMatch(/Git/);
    expect(allowBlocker(list, { connectorLabel: 'GitHub' })).toBeUndefined();
  });

  it('never offers Allow as lifting a built-in or governance Ask', () => {
    expect(
      allowBlocker(
        {
          approval: { setting: 'ask', source: 'governance' },
          connectorAdmin: true,
        },
        { connectorLabel: 'x' },
      ),
    ).toMatch(/governance mode asks first/);
    expect(
      allowBlocker(
        { approval: { setting: 'ask', source: 'builtin' } },
        { connectorLabel: 'x' },
      ),
    ).toBe('Built in. Always asks.');
  });

  it('for a whole connector, skips the tools the platform asks for', () => {
    expect(
      allowBlockerOfMany(
        [
          { approval: { setting: 'ask', source: 'governance' }, server: 'am' },
          list,
        ],
        { labelOf: server => server },
      ),
    ).toBeUndefined();
    expect(allowBlockerOfMany([list, merge], { labelOf: () => 'GitHub' })).toBe(
      'Only GitHub admins can allow this.',
    );
  });
});

describe('shownSetting and the summary', () => {
  it("shows the draft's own setting before muster's report", () => {
    expect(shownSetting(merge, { settings: {} })).toBe('Ask');
    expect(
      shownSetting(merge, { settings: { 'tool:x_github_merge': 'Allow' } }),
    ).toBe('Allow');
  });

  it('counts what runs, asks and is hidden', () => {
    expect(approvalSummary(approvalCounts([merge, list, list]))).toBe(
      '2 run without asking, 1 ask first',
    );
  });
});

describe('review fixes', () => {
  it('forwards the tools a grant covers to muster (a mark without them lifts nothing)', () => {
    expect(
      agentToolsArgumentOf(['server:gh'], undefined, [
        {
          entry: 'server:gh',
          server: 'gh',
          connectorUid: 'u',
          tools: ['merge'],
        },
      ]),
    ).toEqual({
      tools: ['server:gh'],
      grants: [
        { entry: 'server:gh', server: 'gh', uid: 'u', tools: ['merge'] },
      ],
    });
  });

  it('does not warn from an admin right it could not check, and matches through connectors', () => {
    const isAdminOf = connectorAdminFrom([
      {
        server: 'family',
        connectors: [{ server: 'gh' }],
        connectorAdmin: true,
      },
    ]);
    expect(isAdminOf('gh')).toBe(true);
    expect(isAdminOf('family')).toBeUndefined();
    const dropped = droppedExceptions(
      [
        { entry: 'tool:a', server: 'gh' },
        { entry: 'tool:b', server: 'other' },
      ],
      { tools: [{ 'tool:a': 'Allow' }, { 'tool:b': 'Allow' }] },
      isAdminOf,
    );
    expect(dropped.notAdmin).toEqual([]);
    expect(dropped.unchecked.map(grant => grant.server)).toEqual(['other']);
  });

  it('marks a partial report and settings saved but not enforced', () => {
    expect(reportSummary({ tools: [merge], truncated: true }, true)).toBe(
      '1 ask first (of the first tools listed only) — saved, not enforced',
    );
  });

  it('tells a changed list, default, grant or generation apart', () => {
    const agent = {
      toolSettings: ['server:gh'],
      defaultApproval: 'Ask',
      grants: [{ entry: 'server:gh', server: 'gh', tools: ['a'] }],
      generation: 3,
    };
    expect(approvalStateKey(agent)).toBe(approvalStateKey({ ...agent }));
    expect(approvalStateKey({ ...agent, generation: 4 })).not.toBe(
      approvalStateKey(agent),
    );
    expect(
      approvalStateKey({ ...agent, toolSettings: [{ 'server:gh': 'Block' }] }),
    ).not.toBe(approvalStateKey(agent));
  });
});

describe('approval enforcement', () => {
  it('reads the three states, and the boolean of an earlier agent-manager', () => {
    expect(approvalEnforcementOf({ approvalEnforcement: 'pending' })).toBe(
      'pending',
    );
    expect(approvalEnforcementOf({ approvalEnforced: false })).toBe(
      'not-enforced',
    );
    expect(approvalNotEnforced({ approvalEnforcement: 'pending' })).toBe(false);
    expect(
      reportSummary({ tools: [merge], truncated: false }, false, true),
    ).toBe('1 ask first — applies once the agent has rolled out');
  });

  it("recognises agent-manager's refusal of settings on an older chart", () => {
    expect(
      noApprovalChartRefusal({
        code: 'unsupported',
        message:
          'the agent chart 1.4.0 has no tool approval settings (tools, default); use a chart that has them',
      }),
    ).toEqual({ chart: '1.4.0' });
    expect(
      noApprovalChartRefusal({
        code: 'conflict',
        message: 'the agent chart 1.4.0 has no tool approval settings',
      }),
    ).toBeUndefined();
  });
});
