import {
  classifyMargeError,
  confirmModeOf,
  dependencyOf,
  looksUnknownTeam,
  MargeNotConnectedError,
  margeToolName,
  rowsOf,
  statusIntentOf,
  teamOfGroupRef,
  type MargeResult,
} from './marge';

const summary = {
  total: 0,
  merged: 0,
  auto_merge: 0,
  remedied: 0,
  failed: 0,
  security_failures: 0,
  ci_unavailable: 0,
  ci_no_verdict: 0,
  stale: 0,
  refreshed: 0,
  cancelled: 0,
  retried: 0,
  obsolete: 0,
  waiting: 0,
  skipped: 0,
  eligible: 0,
  unclassified: 0,
};

const entry = (repo: string, number: number, title: string, extra = {}) => ({
  owner: 'giantswarm',
  repo,
  number,
  title,
  url: `https://github.com/giantswarm/${repo}/pull/${number}`,
  status: 'Eligible',
  ...extra,
});

describe('margeToolName', () => {
  it('names the tool as muster exposes it', () => {
    expect(margeToolName('list')).toBe('x_marge_list');
    expect(margeToolName('sweep')).toBe('x_marge_sweep');
  });
});

describe('rowsOf', () => {
  it('flattens every group in the engine order and derives the references', () => {
    const result: MargeResult = {
      summary,
      unclassified: [
        entry('backstage', 2250, 'Update dependency typescript to v7', {
          status: 'Unclassified',
        }),
      ],
      action_required: [
        entry(
          'marge',
          5,
          'chore(deps): update module github.com/x/y to v1.2.3',
          {
            status: 'Failed',
          },
        ),
      ],
    };
    const rows = rowsOf(result);
    expect(rows.map(row => [row.group, row.ref, row.dependency])).toEqual([
      ['action_required', 'giantswarm/marge#5', 'github.com/x/y'],
      ['unclassified', 'giantswarm/backstage#2250', 'typescript'],
    ]);
    expect(rows[0].repository).toBe('giantswarm/marge');
  });

  it('is empty without a result', () => {
    expect(rowsOf(undefined)).toEqual([]);
  });
});

describe('dependencyOf', () => {
  it.each([
    ['Update dependency typescript to v7', 'typescript'],
    [
      'chore(deps): update dependency @backstage/ui to v0.17.0',
      '@backstage/ui',
    ],
    ['Update alpine Docker tag to v3.20', 'alpine'],
    ['Update actions/checkout action to v5', 'actions/checkout'],
    ['Update module golang.org/x/net to v0.30.0', 'golang.org/x/net'],
    [
      'chore(deps): update vendir https://github.com/kubernetes-sigs/agent-sandbox to v1.0.3',
      'https://github.com/kubernetes-sigs/agent-sandbox',
    ],
    ['chore(deps): update ocm component backstage to v2.18.1', 'backstage'],
    ['Bump lodash from 4.17.20 to 4.17.21', 'lodash'],
    [
      'build(deps): bump k8s.io/client-go from 0.30 to 0.31',
      'k8s.io/client-go',
    ],
    ['Align files with template', 'Align files with template'],
  ])('%s -> %s', (title, dependency) => {
    expect(dependencyOf(title)).toBe(dependency);
  });
});

describe('confirmModeOf', () => {
  const policy = (confirm: string) => ({
    sweep: true,
    update_types: {},
    rescue: {
      enabled: false,
      weekly: 0,
      budget_enforced: false,
      rescues_dispatched: false,
      confirm,
    },
    concurrency: { per_team: 0, per_repo: 0 },
  });

  it('reads per-sweep off the entries', () => {
    const result: MargeResult = {
      summary,
      skipped: [entry('a', 1, 't', { policy: policy('per-sweep') })],
    };
    expect(confirmModeOf(result)).toBe('per-sweep');
  });

  it('defaults to per-pr when no entry carries a policy (the stored read)', () => {
    expect(confirmModeOf({ summary, skipped: [entry('a', 1, 't')] })).toBe(
      'per-pr',
    );
    expect(confirmModeOf(undefined)).toBe('per-pr');
  });
});

describe('teamOfGroupRef', () => {
  it('drops the team- prefix Giant Swarm groups carry', () => {
    expect(teamOfGroupRef('group:default/team-bumblebee')).toBe('bumblebee');
  });

  it('offers a group without the prefix as it is', () => {
    expect(teamOfGroupRef('group:default/platform-admins')).toBe(
      'platform-admins',
    );
  });

  it('ignores refs that are not groups', () => {
    expect(teamOfGroupRef('user:default/quentin')).toBeUndefined();
  });
});

describe('statusIntentOf', () => {
  it('reads a merge as positive, a failure as negative, unknown as neutral', () => {
    expect(statusIntentOf('merged')).toBe('positive');
    expect(statusIntentOf('action_required')).toBe('negative');
    expect(statusIntentOf('unclassified')).toBe('neutral');
    expect(statusIntentOf('waiting')).toBe('info');
    expect(statusIntentOf('stale')).toBe('warning');
  });
});

describe('classifyMargeError', () => {
  it.each([
    'tool not found: x_marge_list',
    'not signed in',
    'authentication required: server returned 401 Unauthorized',
    'server marge requires authentication',
  ])('reads %j as not connected', message => {
    expect(classifyMargeError(new Error(message))).toBeInstanceOf(
      MargeNotConnectedError,
    );
  });

  it('passes any other refusal on verbatim', () => {
    const error = classifyMargeError(new Error('no team file for "bumblebee"'));
    expect(error).not.toBeInstanceOf(MargeNotConnectedError);
    expect(error.message).toBe('no team file for "bumblebee"');
  });
});

describe('looksUnknownTeam', () => {
  it("reads marge's missing team file as a gap in giantswarm/github", () => {
    expect(
      looksUnknownTeam(
        new Error(
          'no team file for "planeteers": giantswarm/github@main has no team/planeteers.yaml, or it cannot be read',
        ),
      ),
    ).toBe(true);
  });

  it.each([
    new Error('marge refused: 403 Forbidden'),
    new MargeNotConnectedError('not signed in'),
    null,
    undefined,
  ])('reads %s as something else', error => {
    expect(looksUnknownTeam(error)).toBe(false);
  });
});
