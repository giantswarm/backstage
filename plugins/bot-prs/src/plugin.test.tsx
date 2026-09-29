import { renderTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';

import { botPrsPlugin } from './plugin';

/**
 * The page is internal to Giant Swarm: a portal that does not name
 * `page:bot-prs` in `app.extensions` has neither the route nor the sidebar
 * entry it feeds (the nav takes its items from the enabled pages). gazelle's
 * config names it; a customer portal's does not.
 */
describe('botPrsPlugin gating', () => {
  it('is disabled by default: a customer portal has no Bot PRs sidebar entry', async () => {
    await renderTestApp({ features: [botPrsPlugin] });
    await screen.findByRole('navigation', { name: 'sidebar nav' });
    expect(
      screen.queryByRole('link', { name: 'Bot PRs' }),
    ).not.toBeInTheDocument();
  });

  it('shows the sidebar entry once app.extensions names page:bot-prs', async () => {
    await renderTestApp({
      features: [botPrsPlugin],
      config: { app: { extensions: ['page:bot-prs'] } },
    });
    const entry = await screen.findByRole('link', { name: 'Bot PRs' });
    expect(entry).toHaveAttribute('href', '/bot-prs');
  });
});
