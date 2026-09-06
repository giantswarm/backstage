import {
  AGENTS_NOUN,
  describeInstallationGroup,
  groupRowsByInstallation,
  SESSIONS_NOUN,
} from './installationGroups';

const row = (installation: string, id: string) => ({ installation, id });

describe('groupRowsByInstallation', () => {
  it('groups in the given order, home first, with the pipeline', () => {
    const groups = groupRowsByInstallation(
      [row('wombat', 'w1'), row('golem', 'g1'), row('golem', 'g2')],
      {
        installations: ['golem', 'wombat'],
        home: 'golem',
        pipelineFor: name => (name === 'golem' ? 'testing' : undefined),
      },
    );

    expect(groups.map(g => g.installation)).toEqual(['golem', 'wombat']);
    expect(groups[0]).toMatchObject({
      home: true,
      pipeline: 'testing',
      status: 'ready',
    });
    expect(groups[0].rows.map(r => r.id)).toEqual(['g1', 'g2']);
    expect(groups[1]).toMatchObject({ home: false, status: 'ready' });
  });

  it('keeps the order of rows within a group', () => {
    const groups = groupRowsByInstallation(
      [row('golem', 'b'), row('golem', 'a')],
      { installations: ['golem'] },
    );

    expect(groups[0].rows.map(r => r.id)).toEqual(['b', 'a']);
  });

  it('classifies installations without rows', () => {
    const groups = groupRowsByInstallation([], {
      installations: ['loading', 'empty', 'broken', 'far'],
      pending: ['loading'],
      unreachable: ['broken'],
      notReachable: ['far'],
    });

    expect(groups.map(g => g.status)).toEqual([
      'loading',
      'empty',
      'unreachable',
      'not-reachable',
    ]);
  });

  it('shows rows even while the installation is pending again or listed as unreadable', () => {
    // Rows in hand win over a refetch in flight; an installation the provider
    // still lists as unreadable but has rows for is the provider's call.
    const groups = groupRowsByInstallation([row('golem', 'g1')], {
      installations: ['golem'],
      pending: ['golem'],
    });
    expect(groups[0].status).toBe('ready');
  });

  it('never drops rows of an installation that is not listed', () => {
    const groups = groupRowsByInstallation(
      [row('zebra', 'z'), row('apple', 'a'), row('golem', 'g')],
      { installations: ['golem'] },
    );

    expect(groups.map(g => g.installation)).toEqual([
      'golem',
      'apple',
      'zebra',
    ]);
  });
});

describe('describeInstallationGroup', () => {
  it('counts rows with the right noun', () => {
    expect(
      describeInstallationGroup({ status: 'ready', rows: [1] }, AGENTS_NOUN),
    ).toBe('1 agent');
    expect(
      describeInstallationGroup(
        { status: 'ready', rows: [1, 2, 3] },
        SESSIONS_NOUN,
      ),
    ).toBe('3 sessions');
  });

  it('words every other state', () => {
    expect(
      describeInstallationGroup({ status: 'loading', rows: [] }, AGENTS_NOUN),
    ).toBe('loading…');
    expect(
      describeInstallationGroup({ status: 'empty', rows: [] }, AGENTS_NOUN),
    ).toBe('no agents here');
    expect(
      describeInstallationGroup({ status: 'unreachable', rows: [] }, AGENTS_NOUN),
    ).toBe('agents could not be read');
    expect(
      describeInstallationGroup(
        { status: 'not-reachable', rows: [] },
        SESSIONS_NOUN,
      ),
    ).toBe('not reachable from this portal');
  });
});
