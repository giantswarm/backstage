import type { ToolSummary } from '../types';
import { reportForAgent } from './agentApprovalFixtures';

const tool = (
  name: string,
  server: string,
  approval: ToolSummary['approval'],
): ToolSummary => ({ name, server, kind: 'tool', approval });

const catalogue: ToolSummary[] = [
  tool('x_gh_list', 'gh', { setting: 'allow', source: 'tool' }),
  tool('x_gh_merge', 'gh', { setting: 'ask', source: 'tool' }),
  tool('x_gh_close', 'gh', { setting: 'ask', source: 'connector', new: true }),
  tool('x_pd_ack', 'pd', { setting: 'ask', source: 'governance' }),
  tool('x_other_read', 'other', { setting: 'allow', source: 'unreviewed' }),
];

const connectorsOf = (summary: ToolSummary) => [
  {
    server: summary.server!,
    uid: `uid-${summary.server}`,
    tool: summary.name.replace(`x_${summary.server}_`, ''),
  },
];

function report(agentTools: Parameters<typeof reportForAgent>[1]) {
  return new Map(
    reportForAgent(catalogue, agentTools, [], connectorsOf).map(entry => [
      entry.name,
      entry,
    ]),
  );
}

describe('reportForAgent', () => {
  it('narrows the catalogue to the list and keeps the connector settings without agent settings', () => {
    const tools = report({ tools: ['server:gh'] });
    expect([...tools.keys()]).toEqual([
      'x_gh_list',
      'x_gh_merge',
      'x_gh_close',
    ]);
    expect(tools.get('x_gh_merge')?.approval).toEqual({
      setting: 'ask',
      source: 'tool',
    });
    expect(tools.get('x_gh_merge')?.connectors).toEqual([
      { server: 'gh', uid: 'uid-gh', tool: 'merge' },
    ]);
  });

  it('takes the most specific entry, and reports the deciding entry and the admin setting', () => {
    const tools = report({
      tools: [{ 'server:gh': 'Ask' }, { 'tool:x_gh_list': 'Block' }],
    });
    expect(tools.get('x_gh_list')?.approval).toEqual({
      setting: 'block',
      source: 'agent',
      entry: 'tool:x_gh_list',
      admin: { setting: 'allow', source: 'tool' },
    });
    expect(tools.get('x_gh_merge')?.approval).toMatchObject({
      setting: 'ask',
      source: 'tool',
      entry: 'server:gh',
    });
  });

  it('lifts an Ask the connector set only with a matching grant', () => {
    const agentTools = { tools: ['server:gh', { 'tool:x_gh_merge': 'Allow' }] };
    expect(report(agentTools).get('x_gh_merge')?.approval).toMatchObject({
      setting: 'ask',
      source: 'tool',
    });
    expect(
      report({
        ...agentTools,
        grants: [
          {
            entry: 'tool:x_gh_merge',
            server: 'gh',
            uid: 'uid-gh',
            tools: ['merge'],
          },
        ],
      }).get('x_gh_merge')?.approval,
    ).toMatchObject({ setting: 'allow', source: 'agent-exception' });
    // A mark without the tools it covers lifts nothing, as in muster.
    expect(
      report({
        ...agentTools,
        grants: [{ entry: 'tool:x_gh_merge', server: 'gh', uid: 'uid-gh' }],
      }).get('x_gh_merge')?.approval,
    ).toMatchObject({ setting: 'ask', source: 'tool' });
    expect(
      report({
        ...agentTools,
        grants: [{ entry: 'tool:x_gh_merge', server: 'gh', uid: 'other' }],
      }).get('x_gh_merge')?.approval,
    ).toMatchObject({ setting: 'ask', source: 'tool' });
  });

  it('never lifts a governance Ask, grant or not', () => {
    const tools = report({
      tools: [{ 'server:pd': 'Allow' }],
      grants: [
        { entry: 'server:pd', server: 'pd', uid: 'uid-pd', tools: ['ack'] },
      ],
    });
    expect(tools.get('x_pd_ack')?.approval).toMatchObject({
      setting: 'ask',
      source: 'governance',
    });
  });

  it('applies the default to tools without an entry of their own', () => {
    const tools = report({ tools: ['server:other'], default: 'Ask' });
    expect(tools.get('x_other_read')?.approval).toEqual({
      setting: 'ask',
      source: 'agent',
      entry: 'default',
      admin: { setting: 'allow', source: 'unreviewed' },
    });
  });

  it('refuses a malformed list as muster does', () => {
    expect(() => report({ tools: [] })).toThrow(/non-empty/);
    expect(() => report({ tools: [{ 'server:gh': 'allow' }] })).toThrow(
      /Allow, Ask or Block/,
    );
  });
});
