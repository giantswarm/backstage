import { describeWhereItRuns } from './whereItRuns';

describe('describeWhereItRuns', () => {
  const row = {
    installation: 'inst-1',
    cluster: { name: 'wc1', organization: 'acme' },
  };

  it('names the cluster, its organization and the environment', () => {
    expect(describeWhereItRuns(row, true)).toBe('wc1 · acme · inst-1');
  });

  it('leaves out the environment where the page names only one', () => {
    expect(describeWhereItRuns(row, false)).toBe('wc1 · acme');
  });

  it('leaves out an organization the cluster has none of', () => {
    expect(
      describeWhereItRuns({ ...row, cluster: { name: 'wc1' } }, true),
    ).toBe('wc1 · inst-1');
  });
});
