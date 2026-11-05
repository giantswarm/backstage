import { renderInTestApp } from '@backstage/frontend-test-utils';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen } from '@testing-library/react';
import { musterApiRef } from '@giantswarm/backstage-plugin-muster';
import { PageHeaderActionsProvider } from '@giantswarm/backstage-plugin-ui-react';

import {
  fakeOrganizationsMuster,
  type OrganizationsScenario,
} from '../../lib/__fixtures__/agentManagerOrganizations';
import { organizationsRouteRef } from '../../routes';
import { OrganizationDirectoryProvider } from '../OrganizationDirectoryProvider';
import { OrganizationsIndexPage } from './OrganizationsIndexPage';

async function renderList(scenario: OrganizationsScenario) {
  const { api } = fakeOrganizationsMuster(scenario);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await renderInTestApp(
    <TestApiProvider apis={[[musterApiRef, api]]}>
      <QueryClientProvider client={queryClient}>
        <OrganizationDirectoryProvider>
          <PageHeaderActionsProvider>
            <OrganizationsIndexPage />
          </PageHeaderActionsProvider>
        </OrganizationDirectoryProvider>
      </QueryClientProvider>
    </TestApiProvider>,
    { mountedRoutes: { '/organizations': organizationsRouteRef } },
  );
}

describe('OrganizationsIndexPage', () => {
  it("lists the person's organizations, each linking to its page", async () => {
    await renderList({
      mine: {
        organizations: [
          {
            namespace: 'agents-payments-x7k2q',
            organization: 'payments',
            parent: 'org-acme',
          },
        ],
      },
    });

    // A bui list row is the link: it carries its target as `data-href`.
    expect(
      await screen.findByRole('row', { name: /payments/ }),
    ).toHaveAttribute('data-href', '/organizations/gazelle/org-acme/payments');
  });

  it('tells a person in no organization who can add them, in agent-manager’s words', async () => {
    await renderList({
      mine: {
        organizations: [],
        none: 'you belong to no organization: an admin of an organization adds you (add_organization_member), or someone with agent-platform:organizations-admin creates one with you as its first admin',
      },
    });

    expect(
      await screen.findByText('You belong to no organization'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /^You belong to no organization: an admin of an organization adds you/,
      ),
    ).toBeInTheDocument();
  });
});
