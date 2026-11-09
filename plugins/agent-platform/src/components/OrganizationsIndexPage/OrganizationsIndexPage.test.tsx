import { renderInTestApp } from '@backstage/frontend-test-utils';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen } from '@testing-library/react';
// eslint-disable-next-line @backstage/no-mixed-plugin-imports -- The provider reads organizations through the Muster API.
import {
  musterApiRef,
  type MusterApi,
} from '@giantswarm/backstage-plugin-muster';
import { PageHeaderActionsProvider } from '@giantswarm/backstage-plugin-ui-react';

import {
  fakeOrganizationsMuster,
  type OrganizationsScenario,
} from '../../lib/__fixtures__/agentManagerOrganizations';
import { organizationsRouteRef } from '../../routes';
import { OrganizationDirectoryProvider } from '../OrganizationDirectoryProvider';
import { OrganizationsIndexPage } from './OrganizationsIndexPage';

async function renderList(
  scenario: OrganizationsScenario,
  configure?: (api: MusterApi) => void,
) {
  const { api } = fakeOrganizationsMuster(scenario);
  configure?.(api);
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
  it('reports unavailable only after agent-manager answers without organization support', async () => {
    await renderList({}, api => {
      jest.spyOn(api, 'callTool').mockResolvedValue({
        capabilities: { organizations: false },
      });
    });

    expect(
      await screen.findByText('Organizations are not available here'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a failed capability read instead of claiming organizations are unavailable', async () => {
    await renderList({}, api => {
      jest
        .spyOn(api, 'callTool')
        .mockRejectedValue(new Error('Sign in to Agent Manager on gazelle.'));
    });

    expect(
      await screen.findByText('Could not check organization availability'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Sign in to Agent Manager on gazelle/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Organizations are not available here'),
    ).not.toBeInTheDocument();
  });

  it('shows a failed installation inventory instead of claiming organizations are unavailable', async () => {
    await renderList({}, api => {
      jest
        .spyOn(api, 'listInstallations')
        .mockRejectedValue(new Error('Portal inventory is unavailable.'));
    });

    expect(
      await screen.findByText('Portal inventory is unavailable.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Organizations are not available here'),
    ).not.toBeInTheDocument();
  });

  it('shows a failed connector discovery instead of claiming organizations are unavailable', async () => {
    await renderList({}, api => {
      jest
        .spyOn(api, 'listServers')
        .mockRejectedValue(new Error('Connector discovery failed.'));
    });

    expect(
      await screen.findByText(/Could not reach agent-manager on gazelle/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Organizations are not available here'),
    ).not.toBeInTheDocument();
  });

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
