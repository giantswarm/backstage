import { renderTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RepositoriesApi, repositoriesApiRef } from './apis';
import { listingOf } from './fixtures/records';
import { repositoriesPlugin } from './plugin';

const api: RepositoriesApi = {
  getConnection: async () => ({ connected: true }),
  getInfo: async () => ({
    version: 'v0.3.0',
    toolPrefix: 'giantswarm-repo-manager',
    caller: { groups: [] },
    github: {
      apiUrl: '',
      grant: { obtained: true },
      circleciConfigured: false,
    },
    inventory: { connected: true, records: 0 },
  }),
  listRepositories: async () => listingOf([]),
  getRepository: async () => {
    throw new Error('not used');
  },
  refreshRepository: async () => {
    throw new Error('not used');
  },
};

/**
 * The page is internal to Giant Swarm: a portal that does not name
 * `page:repositories` in `app.extensions` has neither the route nor the
 * sidebar entry it feeds (the nav takes its items from the enabled pages).
 * gazelle's config names it; a customer portal's does not.
 */
describe('repositoriesPlugin gating', () => {
  it('is disabled by default: a customer portal has no Repositories sidebar entry', async () => {
    await renderTestApp({
      features: [repositoriesPlugin],
      apis: [[repositoriesApiRef, api]],
    });
    await screen.findByRole('navigation', { name: 'sidebar nav' });
    expect(
      screen.queryByRole('link', { name: 'Repositories' }),
    ).not.toBeInTheDocument();
  });

  it('shows the sidebar entry and serves the page once app.extensions names page:repositories', async () => {
    await renderTestApp({
      features: [repositoriesPlugin],
      apis: [[repositoriesApiRef, api]],
      config: { app: { extensions: ['page:repositories'] } },
    });
    const entry = await screen.findByRole('link', { name: 'Repositories' });
    expect(entry).toHaveAttribute('href', '/repositories');
    await userEvent.click(entry);
    expect(
      await screen.findByRole('tab', { name: 'My team' }, { timeout: 15_000 }),
    ).toBeInTheDocument();
  }, 20_000);
});
