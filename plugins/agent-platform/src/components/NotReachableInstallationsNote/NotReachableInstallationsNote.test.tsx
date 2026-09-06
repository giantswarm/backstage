import { renderInTestApp } from '@backstage/test-utils';
import { screen } from '@testing-library/react';
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
      <NotReachableInstallationsNote installations={['golem', 'wombat']} />,
    );

    expect(
      screen.getByText('golem, wombat: not reachable from this portal'),
    ).toBeInTheDocument();
    // Not a failure of the page: no warning card, nothing to retry.
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
