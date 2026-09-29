import { screen } from '@testing-library/react';
import { renderInTestApp } from '@backstage/test-utils';

import { type MargeEntry, type MargeResult } from '../../lib/marge';
import { OutcomeTable } from './OutcomeTable';

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

describe('OutcomeTable', () => {
  it('orders the rows by repository and number, one row per PR', async () => {
    // The engine answers in its own class order, which puts the waiting PR
    // between two eligible ones of the same repository.
    const result: MargeResult = {
      summary,
      eligible: [entry('openssf-scorecard-exporter', 44), entry('happa', 7)],
      waiting: [entry('openssf-scorecard-exporter', 41)],
    };

    await renderInTestApp(
      <OutcomeTable runs={[{ team: 'bumblebee', result }]} />,
    );

    const refs = screen
      .getAllByRole('link')
      .map(link => link.textContent ?? '');
    expect(refs).toEqual(['#7', '#41', '#44']);
    expect(screen.getByText('happa')).toBeInTheDocument();
    expect(
      screen.queryByRole('columnheader', { name: 'Team' }),
    ).not.toBeInTheDocument();
  });

  it('says what a green PR would get, and names the class of any other', async () => {
    const result: MargeResult = {
      summary,
      eligible: [
        {
          ...entry('happa', 7),
          detail: 'dry-run: would approve, merge (squash)',
        },
      ],
      waiting: [
        {
          ...entry('happa', 8),
          status: 'Waiting',
          detail: 'required checks pending: go-build',
        },
      ],
    };

    await renderInTestApp(
      <OutcomeTable runs={[{ team: 'bumblebee', result }]} />,
    );

    expect(
      screen.getByText('Would approve, merge (squash)'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Eligible')).not.toBeInTheDocument();
    expect(screen.getByText('Waiting')).toBeInTheDocument();
    expect(
      screen.getByText('Required checks pending: go-build'),
    ).toBeInTheDocument();
  });

  it('names the team of each row when the run covers several', async () => {
    await renderInTestApp(
      <OutcomeTable
        showTeam
        runs={[
          {
            team: 'bumblebee',
            result: { summary, eligible: [entry('happa', 7)] },
          },
          {
            team: 'planeteers',
            result: { summary, eligible: [entry('mcp', 3)] },
          },
        ]}
      />,
    );

    expect(
      screen.getByRole('columnheader', { name: 'Team' }),
    ).toBeInTheDocument();
    expect(screen.getByText('bumblebee')).toBeInTheDocument();
    expect(screen.getByText('planeteers')).toBeInTheDocument();
  });

  it('reports a repository the run could not read, outside the table', async () => {
    await renderInTestApp(
      <OutcomeTable
        runs={[
          {
            team: 'bumblebee',
            result: {
              summary,
              eligible: [entry('happa', 7)],
              repositories_failed: [
                { repo: 'giantswarm/gone', error: 'Could not resolve' },
              ],
            },
          },
        ]}
      />,
    );

    expect(
      screen.getByText('marge could not read 1 repository'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('giantswarm/gone: Could not resolve'),
    ).toBeInTheDocument();
  });
});
