import { renderInTestApp } from '@backstage/test-utils';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NotReachableInstallationsNote } from './NotReachableInstallationsNote';

describe('NotReachableInstallationsNote', () => {
  it('renders nothing when every installation is reachable', async () => {
    const { container } = await renderInTestApp(
      <NotReachableInstallationsNote installations={[]} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('names the installations in one quiet line', async () => {
    await renderInTestApp(
      <NotReachableInstallationsNote
        installations={['golem', 'wombat', 'gauss']}
      />,
    );

    expect(
      screen.getByText('golem, wombat, gauss: not reachable from this portal'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/more/)).toBeNull();
    // Not a failure of the page: no warning card, nothing to retry.
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('caps 300 installations at five names, the full list behind a disclosure', async () => {
    const installations = Array.from(
      { length: 300 },
      (_, index) => `inst-${index + 1}`,
    );
    await renderInTestApp(
      <NotReachableInstallationsNote installations={installations} />,
    );

    expect(
      screen.getByText(
        'inst-1, inst-2, inst-3, inst-4, inst-5 and 295 more: not reachable from this portal',
      ),
    ).toBeInTheDocument();
    const disclosure = screen.getByRole('button', {
      name: 'All 300 environments not reachable',
    });
    await userEvent.click(disclosure);
    expect(screen.getByText(/inst-299, inst-300$/)).toBeVisible();
  });
});
