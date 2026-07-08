import { findPlanLinks, planPagePath } from './planLinks';

const REPO = 'giantswarm/bumblebee-plans';

describe('findPlanLinks', () => {
  it('finds proposed-plan PR links', () => {
    const body = `Proposed in https://github.com/giantswarm/bumblebee-plans/pull/7.`;

    const links = findPlanLinks(body, [REPO]);

    expect(links).toEqual([
      {
        repo: REPO,
        pullNumber: 7,
        planDir: undefined,
        url: 'https://github.com/giantswarm/bumblebee-plans/pull/7',
      },
    ]);
    expect(planPagePath(links[0])).toBe(
      '/plans/pr/7?repo=giantswarm%2Fbumblebee-plans',
    );
  });

  it('finds merged-plan blob links and extracts the plan directory', () => {
    const body = `Plan: [PRD](https://github.com/giantswarm/bumblebee-plans/blob/main/agent-platform-mvp/PRD.md)`;

    const links = findPlanLinks(body, [REPO]);

    expect(links).toHaveLength(1);
    expect(links[0].planDir).toBe('agent-platform-mvp');
    expect(planPagePath(links[0])).toBe(
      '/plans?repo=giantswarm%2Fbumblebee-plans',
    );
  });

  it('deduplicates and ignores other repositories', () => {
    const body = [
      'https://github.com/giantswarm/bumblebee-plans/pull/7',
      'https://github.com/giantswarm/bumblebee-plans/pull/7',
      'https://github.com/giantswarm/other/pull/1',
    ].join('\n');

    expect(findPlanLinks(body, [REPO])).toHaveLength(1);
    expect(findPlanLinks(body, [])).toHaveLength(0);
  });
});
