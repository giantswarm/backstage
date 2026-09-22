import { screen } from '@testing-library/react';
import { renderInTestApp } from '@backstage/test-utils';

import { type MargeEntry, type MargeResult } from '../../lib/marge';
import { OutcomeList } from './OutcomeList';

const summary = {
  total: 3,
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
  waiting: 1,
  skipped: 0,
  eligible: 2,
  unclassified: 0,
};

const entry = (repo: string, number: number): MargeEntry => ({
  owner: 'giantswarm',
  repo,
  number,
  title: 'chore(deps): update dependency typescript to v5.9.3',
  url: `https://github.com/giantswarm/${repo}/pull/${number}`,
  status: 'Eligible',
  kind: 'renovate',
});

describe('OutcomeList', () => {
  it('groups the rows by repository and orders them by number', async () => {
    // The engine answers in its own class order, which puts the waiting PR
    // between two eligible ones of the same repository.
    const result: MargeResult = {
      summary,
      eligible: [entry('openssf-scorecard-exporter', 44), entry('happa', 7)],
      waiting: [entry('openssf-scorecard-exporter', 41)],
    };

    await renderInTestApp(<OutcomeList result={result} />);

    const refs = screen
      .getAllByRole('link')
      .map(link => link.textContent ?? '');
    expect(refs).toEqual([
      'giantswarm/happa#7',
      'giantswarm/openssf-scorecard-exporter#41',
      'giantswarm/openssf-scorecard-exporter#44',
    ]);
    expect(screen.getByText('giantswarm/happa')).toBeInTheDocument();
  });

  it('leaves out the repository heading when there is one repository', async () => {
    await renderInTestApp(
      <OutcomeList
        result={{ summary, eligible: [entry('happa', 7)] } as MargeResult}
      />,
    );

    expect(screen.queryByText('giantswarm/happa')).not.toBeInTheDocument();
    expect(screen.getByText('giantswarm/happa#7')).toBeInTheDocument();
  });
});
