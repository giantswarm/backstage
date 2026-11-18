import type { ReactNode } from 'react';
import { Route, Routes } from 'react-router-dom';
import { analyticsApiRef } from '@backstage/frontend-plugin-api';
import { mockApis, renderInTestApp } from '@backstage/frontend-test-utils';
import { TestApiProvider } from '@backstage/test-utils';
import { screen } from '@testing-library/react';
import {
  ModelConfig,
  type ModelConfigInterface,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { musterApiRef } from '@giantswarm/backstage-plugin-muster';
import {
  DateTimeZoneProvider,
  PageHeaderActionsProvider,
} from '@giantswarm/backstage-plugin-ui-react';

import { fakeOrganizationsMuster } from '../../lib/__fixtures__/agentManagerOrganizations';
import {
  agentsRouteRef,
  customizeExternalRouteRef,
  modelsRouteRef,
} from '../../routes';
import { ModelsRouter } from './ModelsRouter';

// A model's page reached through the Models tab's router with its real
// organization directory (`list_organizations` from a fake muster): whether
// it offers Edit for a model agent-manager wrote depends on the directory the
// route provides. Everything else the page reads is a fixed answer.
let mockModel: ModelConfig;
jest.mock('@giantswarm/backstage-plugin-kubernetes-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-kubernetes-react'),
  useResource: () => ({ resource: mockModel, isLoading: false, errors: [] }),
  useSelfSubjectAccessReview: () => ({ allowed: true, isLoading: false }),
}));
jest.mock('@giantswarm/backstage-plugin-gs-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-gs-react'),
  useSignedInConfig: () => ({
    config: { getOptional: () => undefined },
    isLoading: false,
  }),
}));
jest.mock('../ServingProvider', () => ({
  ServingProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  hasServingLayer: () => false,
  useOptionalServing: () => undefined,
  useServing: () => ({
    servingStateFor: () => undefined,
    capabilitiesFor: () => ({}),
    backends: {},
  }),
}));
jest.mock('../ModelConfigsProvider', () => ({
  ModelConfigsProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
  useModelConfigs: () => ({ modelConfigsFor: () => [], isLoading: false }),
}));
jest.mock('../ServedModelRowsProvider', () => ({
  ServedModelRowsProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));
jest.mock('../AgentsDataProvider', () => ({
  AgentsDataProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
  useAgents: () => ({
    rows: [],
    isLoading: false,
    unreachableInstallations: [],
  }),
}));
jest.mock('../../hooks/useLlmUsage', () => ({
  useLlmUsage: () => ({
    usage: undefined,
    isLoading: false,
    isError: false,
    isAvailable: false,
  }),
}));
jest.mock('../../hooks/useAgentAvatarUrl', () => ({
  useAgentAvatarUrl: () => () => undefined,
}));
jest.mock('../InstallationChip', () => ({
  InstallationChip: () => null,
}));
jest.mock('../../hooks/useDeleteModelConfig', () => ({
  useDeleteModelConfig: () => ({
    isDeletable: false,
    isCheckingDeletable: false,
    deleteModelConfig: jest.fn(),
    isDeleting: false,
    error: null,
    reset: jest.fn(),
  }),
}));
jest.mock('../../hooks/useSetDefaultModelConfig', () => ({
  useSetDefaultModelConfig: () => ({
    setDefault: jest.fn(),
    isSetting: false,
    error: null,
    reset: jest.fn(),
  }),
}));

const PAYMENTS = {
  namespace: 'agents-payments-x7k2q',
  organization: 'payments',
  parent: 'org-acme',
};

function writtenByAgentManager(namespace: string) {
  return new ModelConfig(
    {
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
    } as ModelConfigInterface,
    'gazelle',
  );
}

async function renderModelPage(namespace: string) {
  mockModel = writtenByAgentManager(namespace);
  const { api } = fakeOrganizationsMuster({
    mine: { organizations: [PAYMENTS] },
  });
  await renderInTestApp(
    <TestApiProvider
      apis={[
        [musterApiRef, api],
        [analyticsApiRef, mockApis.analytics.mock()],
      ]}
    >
      <DateTimeZoneProvider timeZone="local">
        <PageHeaderActionsProvider>
          <Routes>
            <Route path="/customize/models/*" element={<ModelsRouter />} />
          </Routes>
        </PageHeaderActionsProvider>
      </DateTimeZoneProvider>
    </TestApiProvider>,
    {
      initialRouteEntries: [
        `/customize/models/gazelle/${namespace}/claude-sonnet`,
      ],
      mountedRoutes: {
        '/customize/models': modelsRouteRef,
        '/customize': customizeExternalRouteRef,
        '/customize/agents': agentsRouteRef,
      },
    },
  );
}

describe('ModelsRouter · the page of an organization model', () => {
  it('offers Edit for a model agent-manager wrote in an organization', async () => {
    await renderModelPage(PAYMENTS.namespace);

    expect(
      await screen.findByRole('button', { name: 'Edit' }),
    ).toBeInTheDocument();
  });

  it('withholds Edit for a model agent-manager asserts outside an organization', async () => {
    await renderModelPage('team-models');

    expect(
      await screen.findByText(/agent-manager would revert edits made here/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
  });
});
