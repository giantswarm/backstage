import type { ReactNode } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { TestApiProvider } from '@backstage/test-utils';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import type { KubernetesApi } from '@backstage/plugin-kubernetes-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { musterApiRef } from '@giantswarm/backstage-plugin-muster';
import { PageHeaderActionsProvider } from '@giantswarm/backstage-plugin-ui-react';

import {
  CREDENTIAL_OPERATION,
  fakeOrganizationsMuster,
  toolCalls,
} from '../../lib/__fixtures__/agentManagerOrganizations';
import { modelsRouteRef, organizationsRouteRef } from '../../routes';
import { ModelsRouter } from './ModelsRouter';

// The page as the Customize screen mounts it: ModelsRouter alone, with the
// real organization directory, `useModelNamespaces` and Connect a model. The
// directory's reads go to a fake muster (agent-manager's `get_info` and
// `list_organizations`), the access reviews to a fake Kubernetes proxy.
// The plugin's query client is swapped for a fresh one per test.
jest.mock('../QueryClientProvider', () => ({
  QueryClientProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));

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
 * The person's SelfSubjectAccessReviews for ModelConfigs, answered per
 * namespace: allowed in the ones listed.
 */
function fakeModelConfigAccess(allowed: string[]) {
  const proxy = jest.fn(
    async ({ path, init }: { path: string; init?: RequestInit }) => {
      if (!path.endsWith('/selfsubjectaccessreviews')) {
        throw new Error(`unexpected Kubernetes request ${path}`);
      }
      const { namespace, resource } = JSON.parse(String(init?.body)).spec
        .resourceAttributes;
      return new Response(
        JSON.stringify({
          status: {
            allowed: resource === 'modelconfigs' && allowed.includes(namespace),
          },
        }),
        { status: 201 },
      );
    },
  );
  return { api: { proxy } as unknown as KubernetesApi, proxy };
}

/** The namespaces the person's access reviews asked about. */
function reviewedNamespaces(proxy: jest.Mock): string[] {
  return proxy.mock.calls.map(
    ([{ init }]) =>
      JSON.parse(String(init?.body)).spec.resourceAttributes.namespace,
  );
}

const CurrentPath = () => {
  const { pathname } = useLocation();
  return <div data-testid="path">{pathname}</div>;
};

async function renderNewModel({ allowed }: { allowed: string[] }) {
  const { api, callTool } = fakeOrganizationsMuster({
    mine: { organizations: [PAYMENTS] },
  });
  // agent-manager manages the platform namespace and the organization's.
  const answer = callTool.getMockImplementation()!;
  callTool.mockImplementation(async (name, args) =>
    name === 'x_agent-manager_get_info'
      ? {
          namespaces: {
            default: 'kagent',
            managed: ['kagent', PAYMENTS.namespace],
          },
          capabilities: { organizations: true },
        }
      : answer(name, args),
  );
  const kubernetes = fakeModelConfigAccess(allowed);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  await renderInTestApp(
    <TestApiProvider
      apis={[
        [musterApiRef, api],
        [kubernetesApiRef, kubernetes.api],
      ]}
    >
      <QueryClientProvider client={queryClient}>
        <PageHeaderActionsProvider>
          <Routes>
            <Route path="/customize/models/*" element={<ModelsRouter />} />
            <Route path="*" element={<CurrentPath />} />
          </Routes>
        </PageHeaderActionsProvider>
      </QueryClientProvider>
    </TestApiProvider>,
    {
      initialRouteEntries: ['/customize/models/new'],
      mountedRoutes: {
        '/customize/models': modelsRouteRef,
        '/organizations': organizationsRouteRef,
      },
    },
  );
  return { callTool, proxy: kubernetes.proxy };
}

describe('Connect a model, under the Models tab: the owner', () => {
  it('offers an Organization the person may create ModelConfigs in, and saves its model through agent-manager', async () => {
    const user = userEvent.setup();
    const { callTool, proxy } = await renderNewModel({
      allowed: ['kagent', PAYMENTS.namespace],
    });

    const owner = await screen.findByRole('button', { name: /Owner/ });
    await waitFor(() =>
      expect(reviewedNamespaces(proxy).sort()).toEqual(
        ['kagent', PAYMENTS.namespace].sort(),
      ),
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
    // A member of the Organization, not one of its admins.
    const { callTool, proxy } = await renderNewModel({ allowed: ['kagent'] });

    await waitFor(() =>
      expect(reviewedNamespaces(proxy).sort()).toEqual(
        ['kagent', PAYMENTS.namespace].sort(),
      ),
    );
    await waitFor(() =>
      expect(toolCalls(callTool, 'list_organizations')).toHaveLength(1),
    );
    expect(
      await screen.findByRole('button', { name: 'Connect model' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Owner/ })).toBeNull();
  });
});
