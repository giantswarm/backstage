import { ManagerInfo } from '../apis';
import { defaultScope, teamOptions, teamsOf } from './scope';

const info = (groups: string[]): ManagerInfo => ({
  version: 'v0.3.0',
  toolPrefix: 'giantswarm-repo-manager',
  caller: { email: 'someone@example.com', groups },
  github: { apiUrl: '', grant: { obtained: true }, circleciConfigured: false },
  inventory: { connected: true, records: 3 },
});

describe('defaultScope', () => {
  it('opens on My team', () => {
    expect(
      defaultScope(info(['giantswarm-github:giantswarm:team-bumblebee'])),
    ).toBe('mine');
    expect(defaultScope(undefined)).toBe('mine');
  });

  it('opens on Unassigned for a Planeteer', () => {
    expect(
      defaultScope(
        info([
          'giantswarm-github:giantswarm:employees',
          'giantswarm-github:giantswarm:team-planeteers',
        ]),
      ),
    ).toBe('unassigned');
  });
});

describe('teamsOf', () => {
  it('reads the caller’s team slugs off the groups, sorted, once each', () => {
    expect(
      teamsOf(
        info([
          'giantswarm-github:giantswarm:employees',
          'giantswarm-github:giantswarm:team-planeteers',
          'giantswarm-github:giantswarm:team-bumblebee',
          'giantswarm-github:giantswarm:team-bumblebee',
        ]),
      ),
    ).toEqual(['team-bumblebee', 'team-planeteers']);
    expect(teamsOf(undefined)).toEqual([]);
  });
});

describe('teamOptions', () => {
  const mine = info(['giantswarm-github:giantswarm:team-bumblebee']);

  it('offers the caller’s teams first, labelled, then the inventory’s, sorted and once each', () => {
    expect(
      teamOptions(mine, ['team-rocket', 'team-bumblebee', '', 'team-atlas']),
    ).toEqual([
      { id: 'team-bumblebee', label: 'team-bumblebee (your team)', mine: true },
      { id: 'team-atlas', label: 'team-atlas', mine: false },
      { id: 'team-rocket', label: 'team-rocket', mine: false },
    ]);
  });

  it('keeps the team the form holds when neither source names it', () => {
    expect(teamOptions(mine, [], 'team-new')).toEqual([
      { id: 'team-bumblebee', label: 'team-bumblebee (your team)', mine: true },
      { id: 'team-new', label: 'team-new', mine: false },
    ]);
    expect(teamOptions(mine, [], 'team-bumblebee')).toHaveLength(1);
  });

  it('is empty while nothing is known', () => {
    expect(teamOptions(undefined, [])).toEqual([]);
  });
});
