import { render, screen, within } from '@testing-library/react';
import { watchOf, watchReady, watchRedRelease } from '../../fixtures/records';
import { watchPhases } from '../../lib/phases';
import { PhaseList } from './PhaseList';

const row = (name: string) => screen.getByTestId(`phase-${name}`);

describe('PhaseList', () => {
  it('lists the phases done with their timing and links, the one waiting with its reason, the rest dimmed', () => {
    render(<PhaseList phases={watchPhases(watchOf('declared'))} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(6);
    expect(row('created')).toHaveTextContent(
      /^Created at 10:00:00Z repository ↗$/,
    );
    expect(
      within(row('created')).getByRole('link', { name: /repository/ }),
    ).toHaveAttribute('href', 'https://github.com/giantswarm/shiny-service');
    expect(row('scaffolded')).toHaveTextContent(/^Scaffolded after 4 s$/);
    expect(row('declared')).toHaveTextContent(
      /^Declared after 13 s \(\+9 s\) pull request ↗$/,
    );
    expect(row('merged')).toHaveAttribute('data-state', 'pending');
    expect(row('merged')).toHaveTextContent(
      /^Merged the declaration pull request has not merged yet$/,
    );
    expect(row('setUp')).toHaveAttribute('data-state', 'ahead');
    expect(row('setUp')).toHaveTextContent(/^Set up$/);
    expect(row('released')).toHaveAttribute('data-state', 'ahead');
  });

  it('ready: the release linked by its tag with the time since the creation', () => {
    render(<PhaseList phases={watchPhases(watchReady)} />);
    expect(row('released')).toHaveAttribute('data-state', 'done');
    expect(row('released')).toHaveTextContent(
      /^Released after 4 min 10 s \(\+1 min 41 s\) v0\.1\.0 ↗$/,
    );
    expect(
      within(row('released')).getByRole('link', { name: /v0\.1\.0/ }),
    ).toHaveAttribute(
      'href',
      'https://github.com/giantswarm/shiny-service/releases/tag/v0.1.0',
    );
  });

  it('a failed phase carries the manager’s reason', () => {
    render(<PhaseList phases={watchPhases(watchRedRelease)} />);
    expect(row('released')).toHaveAttribute('data-state', 'failed');
    expect(row('released')).toHaveTextContent(
      'the CircleCI statuses on v0.1.0 are failure: ci/circleci: build (failure)',
    );
    expect(row('setUp')).toHaveAttribute('data-state', 'done');
  });
});
