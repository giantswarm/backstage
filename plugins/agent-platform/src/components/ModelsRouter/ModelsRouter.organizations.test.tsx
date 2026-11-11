import type { ReactNode } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { TestApiProvider } from '@backstage/test-utils';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { QueryClient } from '@tanstack/react-query';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { musterApiRef } from '@giantswarm/backstage-plugin-muster';
import { PageHeaderActionsProvider } from '@giantswarm/backstage-plugin-ui-react';

import {
  CREDENTIAL_OPERATION,
  fakeOrganizationAccess,
  fakeOrganizationsMuster,
  toolCalls,
  type OrganizationsScenario,
} from '../../lib/__fixtures__/agentManagerOrganizations';
import { modelsRouteRef, organizationsRouteRef } from '../../routes';
import { ModelsRouter } from './ModelsRouter';

// The page as the Customize screen mounts it: ModelsRouter alone, with no
// query client or directory above it, and the real organization directory,
// `useModelNamespaces` and Connect a model below. The directory's reads go to
// a fake muster (agent-manager's `get_info` and `list_organizations`), the
// access reviews to a fake Kubernetes proxy. The plugin's query client is
// the one thing swapped, for a fresh one per test without the persister: a
// router that mounted none would leave the directory without a client.
let mockQueryClient: QueryClient;
jest.mock('../QueryClientProvider', () => {
  const { QueryClientProvider } = jest.requireActual('@tanstack/react-query');
  return {
    QueryClientProvider: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={mockQueryClient}>
        {children}
      </QueryClientProvider>
    ),
  };
});

// One environment, gazelle, which Connect a model picks by itself.
jest.mock('@giantswarm/backstage-plugin-gs', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-gs'),
  useInstallations: () => ({
    installations: [{ name: 'gazelle' }],
    isLoading: false,
  }),
  useInstallationInventory: () => ({
    installationsWith: () => ['gazelle'],
    isLoading: false,
    isProbing: false,
  }),
  useInstallationScope: () => ({ scope: 'all' }),
}));

// The tab's other providers read KServe and the cluster's ModelConfigs:
// irrelevant to where a model may go, so they stand empty.
function mockPassThrough({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
jest.mock('../ModelConfigsProvider', () => ({
  ModelConfigsProvider: mockPassThrough,
  useModelConfigs: () => ({ modelConfigsFor: () => [], isLoading: false }),
}));
jest.mock('../ServingProvider', () => ({
  ServingProvider: mockPassThrough,
  hasServingLayer: () => false,
  useOptionalServing: () => undefined,
}));
jest.mock('../ServedModelRowsProvider', () => ({
  ServedModelRowsProvider: mockPassThrough,
}));

const PAYMENTS = {
  namespace: 'agents-payments-x7k2q',
  organization: 'payments',
  parent: 'org-acme',
};

/**
 * A member of the payments Organization on gazelle, whose agent-manager
 * manages the platform namespace and the Organization's.
 */
const MEMBER: OrganizationsScenario = {
  mine: { organizations: [PAYMENTS] },
  managed: ['kagent', PAYMENTS.namespace],
};

/** The namespaces the person's access reviews asked about. */
function reviewedNamespaces(proxy: jest.Mock): string[] {
  return proxy.mock.calls
    .map(
      ([{ init }]) =>
        JSON.parse(String(init?.body)).spec.resourceAttributes.namespace,
    )
    .sort();
}

const CurrentPath = () => {
  const { pathname } = useLocation();
  return <div data-testid="path">{pathname}</div>;
};

async function renderNewModel(scenario: OrganizationsScenario) {
  const { api, callTool } = fakeOrganizationsMuster(scenario);
  const kubernetes = fakeOrganizationAccess(
    scenario.access,
    scenario.namespaceAccess,
  );
  await renderInTestApp(
    <TestApiProvider
      apis={[
        [musterApiRef, api],
        [kubernetesApiRef, kubernetes],
      ]}
    >
      <PageHeaderActionsProvider>
        <Routes>
          <Route path="/customize/models/*" element={<ModelsRouter />} />
          <Route path="*" element={<CurrentPath />} />
        </Routes>
      </PageHeaderActionsProvider>
    </TestApiProvider>,
    {
      initialRouteEntries: ['/customize/models/new'],
      mountedRoutes: {
        '/customize/models': modelsRouteRef,
        '/organizations': organizationsRouteRef,
      },
    },
  );
  const { proxy } = kubernetes as unknown as { proxy: jest.Mock };
  return { callTool, proxy };
}

beforeEach(() => {
  mockQueryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});

describe('Connect a model, under the Models tab: the owner', () => {
  it('offers an Organization the person may create ModelConfigs in, and saves its model through agent-manager', async () => {
    const user = userEvent.setup();
    // An admin of the Organization: the cluster lets them create its
    // ModelConfigs (the fixture allows every review by default).
    const { callTool, proxy } = await renderNewModel(MEMBER);

    const owner = await screen.findByRole('button', { name: /Owner/ });
    expect(reviewedNamespaces(proxy)).toEqual(
      ['kagent', PAYMENTS.namespace].sort(),
    );
    await user.click(owner);
    expect(
      screen.getAllByRole('option').map(option => option.textContent),
    ).toEqual(['Platform', 'payments']);
    await user.click(screen.getByRole('option', { name: 'payments' }));

    // An Organization's model: its key goes on the credential form.
    expect(
      await screen.findByText(/You enter the key on the next page/),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText(/^Name/), 'sonnet');
    await user.type(screen.getByRole('textbox', { name: /^Model/ }), 'claude');
    await user.click(
      screen.getByRole('button', { name: 'Continue to the key' }),
    );

    await waitFor(() =>
      expect(screen.getByTestId('path')).toHaveTextContent(
        `/organizations/gazelle/org-acme/payments/credentials/${CREDENTIAL_OPERATION}`,
      ),
    );
    expect(toolCalls(callTool, 'set_organization_model')).toEqual([
      expect.objectContaining({
        namespace: PAYMENTS.namespace,
        name: 'sonnet',
      }),
    ]);
  });

  it('shows no owner picker when only the platform namespace qualifies', async () => {
    // A member, not an admin: the cluster refuses them the Organization's
    // ModelConfigs.
    const { callTool, proxy } = await renderNewModel({
      ...MEMBER,
      namespaceAccess: { [PAYMENTS.namespace]: { modelconfigs: false } },
    });

    // Connect model is held until the owners are known, then offered.
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Connect model' }),
      ).toBeEnabled(),
    );
    expect(toolCalls(callTool, 'list_organizations')).toHaveLength(1);
    expect(reviewedNamespaces(proxy)).toEqual(
      ['kagent', PAYMENTS.namespace].sort(),
    );
    expect(screen.queryByRole('button', { name: /Owner/ })).toBeNull();
  });
});
