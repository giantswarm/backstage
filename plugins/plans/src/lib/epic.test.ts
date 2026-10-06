import { epicPlansOf, epicTabOf, issueKey, issueOfItem } from './epic';
import { isHiveTab } from './hiveTabs';

const epic = (number: number) => ({
  owner: 'giantswarm',
  repo: 'roadmap',
  number,
  url: `https://github.com/giantswarm/roadmap/issues/${number}`,
});

describe('epic', () => {
  it('reads the tab from the path below the epic page', () => {
    expect(epicTabOf('')).toBe('overview');
    expect(epicTabOf('plan')).toBe('plan');
    expect(epicTabOf('sub-issues')).toBe('sub-issues');
    expect(epicTabOf('nonsense')).toBe('overview');
  });

  it('keys a board item by its issue', () => {
    const issue = issueOfItem({
      repository: { nameWithOwner: 'giantswarm/roadmap' },
      number: 4039,
    });
    expect(issueKey(issue)).toBe('giantswarm/roadmap#4039');
    expect(issueOfItem({ repository: null, number: '' })).toBeUndefined();
  });

  it("finds an epic's plans across repositories", () => {
    const plans = epicPlansOf(
      [
        {
          repo: 'example/team-plans',
          merged: [
            { folder: 'hive', path: 'hive/README.md', epic: epic(4039) },
          ],
          pulls: [
            { number: 41, title: 'Hive', epic: epic(4039) },
            { number: 39, title: 'marge', epic: epic(4360) },
          ],
        },
      ],
      { owner: 'giantswarm', repo: 'roadmap', number: 4039 },
    );
    expect(plans.pulls.map(pull => pull.number)).toEqual([41]);
    expect(plans.merged.map(plan => plan.folder)).toEqual(['hive']);
  });

  it('routes the epics and the plans without a tab', () => {
    expect(isHiveTab('sub-page:plans/hive-now')).toBe(true);
    expect(isHiveTab('sub-page:plans/hive-epics')).toBe(false);
    expect(isHiveTab('sub-page:plans/hive-plans')).toBe(false);
  });
});
