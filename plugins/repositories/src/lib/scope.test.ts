import { ManagerInfo } from '../apis';
import { RepositoryRow } from '../apis';
import { callerTeams, defaultScope, teamOptions, teamsOf } from './scope';

const row = (team?: string): RepositoryRow => ({
  repository: `giantswarm/${team ?? 'nobody'}-repo`,
  team,
  archived: false,
  setup: {},
  age: '1h',
});

const info = (groups: string[]): ManagerInfo => ({
  version: 'v0.3.0',
  toolPrefix: 'giantswarm-repo-manager',
  caller: { email: 'someone@example.com', groups },
  github: { apiUrl: '', grant: { obtained: true } },
  inventory: { connected: true, records: 3 },
  circleci: { source: 'statuses+artifact' },
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

describe('callerTeams', () => {
  it('reads the teams off the mine listing -- membership as the manager read it on GitHub -- and the groups, sorted, once each', () => {
    expect(
      callerTeams(info([]), [
        row('team-planeteers'),
        row('team-bumblebee'),
        row('team-bumblebee'),
        row(undefined),
      ]),
    ).toEqual(['team-bumblebee', 'team-planeteers']);
    expect(
      callerTeams(info(['giantswarm-github:giantswarm:team-rocket']), [
        row('team-bumblebee'),
      ]),
    ).toEqual(['team-bumblebee', 'team-rocket']);
    expect(callerTeams(undefined, [])).toEqual([]);
  });
});

describe('teamOptions', () => {
  const mine = ['team-bumblebee'];

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
    expect(teamOptions([], [])).toEqual([]);
  });
});
