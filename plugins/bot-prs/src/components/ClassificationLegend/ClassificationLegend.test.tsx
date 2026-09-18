import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { rowsOf, type MargeResult } from '../../lib/marge';
import { ClassificationLegend } from './ClassificationLegend';

const summary = {
  total: 2,
  merged: 0,
  auto_merge: 0,
  remedied: 0,
  failed: 1,
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
  unclassified: 1,
};

const entry = (repo: string, number: number, status: string) => ({
  owner: 'giantswarm',
  repo,
  number,
  title: 'chore(deps): update dependency typescript to v5.9.3',
  url: `https://github.com/giantswarm/${repo}/pull/${number}`,
  status,
});

const queue: MargeResult = {
  summary,
  action_required: [entry('backstage', 2250, 'Failed')],
  unclassified: [entry('marge', 111, 'Unclassified')],
};

const rows = rowsOf(queue, 'bumblebee');

describe('ClassificationLegend', () => {
  it('explains the classes in view, with how many carry each', async () => {
    render(<ClassificationLegend rows={rows} onClassification={jest.fn()} />);

    await userEvent.click(
      screen.getByRole('button', { name: /What the classifications mean/ }),
    );

    expect(await screen.findByText('Failed (1)')).toBeInTheDocument();
    expect(screen.getByText('Unclassified (1)')).toBeInTheDocument();
    expect(
      screen.getByText(/no sweep has labelled it. Classify now decides it./),
    ).toBeInTheDocument();
    // A class no PR in view carries explains nothing about this queue.
    expect(screen.queryByText(/^Merged/)).not.toBeInTheDocument();
  });

  it('narrows the queue to one class, and clears it on a second click', async () => {
    const onClassification = jest.fn();
    const { rerender } = render(
      <ClassificationLegend rows={rows} onClassification={onClassification} />,
    );

    await userEvent.click(
      screen.getByRole('button', { name: /What the classifications mean/ }),
    );
    await userEvent.click(await screen.findByText('Unclassified (1)'));
    expect(onClassification).toHaveBeenLastCalledWith('unclassified');

    rerender(
      <ClassificationLegend
        rows={rows}
        classification="unclassified"
        onClassification={onClassification}
      />,
    );
    await userEvent.click(screen.getByText('Unclassified (1)'));
    expect(onClassification).toHaveBeenLastCalledWith(undefined);
  });

  it('is nothing at all without rows', () => {
    const { container } = render(
      <ClassificationLegend rows={[]} onClassification={jest.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
