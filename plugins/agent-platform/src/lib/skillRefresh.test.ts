import type { AgentSkillEntry } from './agentManager';
import { refreshChangesAnything, skillRefreshPlan } from './skillRefresh';

const PINNED = 'cb1fb768ba1d1b1e62c6e0b32c39a6b4bd3b58a1';
const HEAD = '9f2c1a7e0b4d6c8a2e1f3b5d7c9a1b3d5e7f9a1b';
const REPO = 'https://github.com/giantswarm/agent-skills';

const current: AgentSkillEntry[] = [
  { name: 'pr-review', path: 'pr-review', git: { url: REPO, commit: PINNED } },
  { name: 'incident', path: 'incident', git: { url: REPO, commit: PINNED } },
  {
    name: 'runbooks',
    oci: 'gsoci.azurecr.io/giantswarm/skills/runbooks@sha256:0123456789abcdef',
  },
];

describe('skillRefreshPlan', () => {
  it('shows every git skill at its pin next to the head the dry run resolved, and which entries change', () => {
    const plan = skillRefreshPlan(current, [
      // agent-manager re-derives the name from the path; matching is by place.
      {
        name: 'pr-review',
        path: 'pr-review',
        git: { url: REPO, commit: HEAD },
      },
      {
        name: 'incident',
        path: 'incident',
        git: { url: REPO, commit: PINNED },
      },
      {
        name: 'runbooks',
        oci: 'gsoci.azurecr.io/giantswarm/skills/runbooks@sha256:0123456789abcdef',
      },
    ]);
    expect(plan).toEqual([
      {
        name: 'pr-review',
        kind: 'git',
        source: REPO,
        path: 'pr-review',
        pinned: PINNED,
        head: HEAD,
        changes: true,
      },
      {
        name: 'incident',
        kind: 'git',
        source: REPO,
        path: 'incident',
        pinned: PINNED,
        head: PINNED,
        changes: false,
      },
      {
        name: 'runbooks',
        kind: 'oci',
        source:
          'gsoci.azurecr.io/giantswarm/skills/runbooks@sha256:0123456789abcdef',
        pinned:
          'gsoci.azurecr.io/giantswarm/skills/runbooks@sha256:0123456789abcdef',
        changes: false,
      },
    ]);
    expect(refreshChangesAnything(plan)).toBe(true);
  });

  it('lists digest-pinned skills and leaves them alone', () => {
    const plan = skillRefreshPlan([current[2]], [current[2]]);
    expect(plan[0]).toMatchObject({ kind: 'oci', changes: false });
    expect(plan[0].head).toBeUndefined();
    expect(refreshChangesAnything(plan)).toBe(false);
  });

  it('shows the pins without a head while the dry run has not answered', () => {
    const plan = skillRefreshPlan(current, undefined);
    expect(plan.map(entry => entry.head)).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
    expect(refreshChangesAnything(plan)).toBe(false);
  });

  it('says nothing changes when every skill is already at its head', () => {
    expect(refreshChangesAnything(skillRefreshPlan(current, current))).toBe(
      false,
    );
  });
});
