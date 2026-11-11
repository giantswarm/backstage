import type { ReactNode } from 'react';
import { Route, Routes } from 'react-router-dom';
import { analyticsApiRef } from '@backstage/frontend-plugin-api';
import { mockApis, renderInTestApp } from '@backstage/frontend-test-utils';
import { TestApiProvider } from '@backstage/test-utils';
import { screen } from '@testing-library/react';
import type { KubernetesApi } from '@backstage/plugin-kubernetes-react';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { musterApiRef } from '@giantswarm/backstage-plugin-muster';
import { PageHeaderActionsProvider } from '@giantswarm/backstage-plugin-ui-react';

import { fakeOrganizationsMuster } from '../../lib/__fixtures__/agentManagerOrganizations';
import { customizeExternalRouteRef, modelsRouteRef } from '../../routes';
import { ModelsRouter } from './ModelsRouter';

// Edit model reached through the Models tab's router with its real
// organization directory (`list_organizations` from a fake muster), so the
// directory the edit guard reads is the one the route provides. The data
// providers below the directory are not the subject and pass through.
jest.mock('../ModelConfigsProvider', () => ({
  ModelConfigsProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
  useModelConfigs: () => ({ modelConfigsFor: () => [], isLoading: false }),
}));
jest.mock('../ServingProvider', () => ({
  ServingProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  hasServingLayer: () => false,
  useOptionalServing: () => undefined,
  useServing: () => ({ installations: [], unreachableInstallations: [] }),
}));
jest.mock('../ServedModelRowsProvider', () => ({
  ServedModelRowsProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));
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

const PAYMENTS = {
  namespace: 'agents-payments-x7k2q',
  organization: 'payments',
  parent: 'org-acme',
};

/** A model agent-manager wrote with `set_organization_model`. */
function modelConfig(namespace: string) {
  return {
    apiVersion: 'api.kagent.dev/v1alpha3',
    kind: 'ModelConfig',
    metadata: {
      name: 'claude-sonnet',
      namespace,
      labels: { 'app.kubernetes.io/managed-by': 'agent-manager' },
    },
    spec: {
      provider: 'Anthropic',
      model: 'claude-sonnet-4-6',
      apiKeySecret: 'tenant-credential-claude-sonnet',
      apiKeySecretKey: 'apiKey',
    },
  };
}

/** The Kubernetes proxy: the person's access reviews, and the one model. */
function fakeKubernetes(namespace: string) {
  const proxy = jest.fn(async ({ path }: { path: string }) => {
    if (path.endsWith('/selfsubjectaccessreviews')) {
      return new Response(JSON.stringify({ status: { allowed: true } }), {
        status: 201,
      });
    }
    if (
      path
        .replace(/\/$/, '')
        .endsWith(`/namespaces/${namespace}/modelconfigs/claude-sonnet`)
    ) {
      return new Response(JSON.stringify(modelConfig(namespace)), {
        status: 200,
      });
    }
    return new Response(JSON.stringify({ items: [] }), { status: 200 });
  });
  return { proxy } as unknown as KubernetesApi;
}

async function renderEdit(namespace: string) {
  const { api } = fakeOrganizationsMuster({
    mine: { organizations: [PAYMENTS] },
  });
  await renderInTestApp(
    <TestApiProvider
      apis={[
        [musterApiRef, api],
        [kubernetesApiRef, fakeKubernetes(namespace)],
        [analyticsApiRef, mockApis.analytics.mock()],
      ]}
    >
      <PageHeaderActionsProvider>
        <Routes>
          <Route path="/customize/models/*" element={<ModelsRouter />} />
        </Routes>
      </PageHeaderActionsProvider>
    </TestApiProvider>,
    {
      initialRouteEntries: [
        `/customize/models/gazelle/${namespace}/claude-sonnet/edit`,
      ],
      mountedRoutes: {
        '/customize/models': modelsRouteRef,
        '/customize': customizeExternalRouteRef,
      },
    },
  );
}

describe('ModelsRouter · Edit model of an organization', () => {
  it("opens the form for an organization's model agent-manager wrote", async () => {
    await renderEdit(PAYMENTS.namespace);

    expect(
      await screen.findByRole('switch', {
        name: 'Enter a new key on the next page',
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('This model cannot be edited from here'),
    ).not.toBeInTheDocument();
  });

  it('keeps the blocker for a model agent-manager asserts outside an organization', async () => {
    await renderEdit('team-models');

    expect(
      await screen.findByText(/asserted by agent-manager, which would revert/),
    ).toBeInTheDocument();
  });
});
