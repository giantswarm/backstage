import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import { HiveLink } from './HiveLink';

describe('HiveLink', () => {
  it('keeps a portal path in the tab', async () => {
    await renderInTestApp(<HiveLink href="/roadmap/items/7">Epic</HiveLink>);

    const link = screen.getByRole('link', { name: 'Epic' });
    expect(link).toHaveAttribute('href', '/roadmap/items/7');
    expect(link).not.toHaveAttribute('target');
  });

  it('opens a link out of the portal in a new tab, and says so', async () => {
    await renderInTestApp(
      <HiveLink href="https://github.com/example-org/plans/pull/3">
        Plan
      </HiveLink>,
    );

    const link = screen.getByRole('link', {
      name: 'Plan (opens in a new tab)',
    });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });
});
