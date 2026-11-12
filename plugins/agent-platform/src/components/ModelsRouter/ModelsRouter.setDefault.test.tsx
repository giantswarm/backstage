import type { ReactNode } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { analyticsApiRef } from '@backstage/frontend-plugin-api';
import { mockApis, renderInTestApp } from '@backstage/frontend-test-utils';
import { TestApiProvider } from '@backstage/test-utils';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  ModelConfig,
  type ModelConfigInterface,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { musterApiRef } from '@giantswarm/backstage-plugin-muster';
import {
  DateTimeZoneProvider,
  PageHeaderActionsProvider,
} from '@giantswarm/backstage-plugin-ui-react';

import {
  CREDENTIAL_OPERATION,
  fakeOrganizationsMuster,
  toolCalls,
  type OrganizationsScenario,
} from '../../lib/__fixtures__/agentManagerOrganizations';
import {
  agentsRouteRef,
  customizeExternalRouteRef,
  modelsRouteRef,
  organizationsRouteRef,
} from '../../routes';
import { ModelsRouter } from './ModelsRouter';

// Set as default on the page of an organization's model, reached through the
// Models tab's router with its real organization directory and the real
// set-default hook: the move goes to agent-manager as the person. What the
// page reads besides is a fixed answer.
let mockModel: ModelConfig;
let mockListed: ModelConfig[] = [];
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
  useModelConfigs: () => ({
    modelConfigsFor: () => mockListed,
    isLoading: false,
  }),
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

const PAYMENTS = {
  namespace: 'agents-payments-x7k2q',
  organization: 'payments',
  parent: 'org-acme',
};

const MARK = 'agent-platform.giantswarm.io/is-default-model-config';

function model(name: string, { marked = false } = {}) {
  return new ModelConfig(
    {
      apiVersion: 'api.kagent.dev/v1alpha3',
      kind: 'ModelConfig',
      metadata: {
        name,
        namespace: PAYMENTS.namespace,
        labels: { 'app.kubernetes.io/managed-by': 'agent-manager' },
        ...(marked ? { annotations: { [MARK]: 'true' } } : {}),
      },
      spec: {
        provider: 'Anthropic',
        model: 'claude-sonnet-4-6',
        apiKeySecret: `tenant-credential-${name}`,
        apiKeySecretKey: 'apiKey',
      },
    } as ModelConfigInterface,
    'gazelle',
  );
}

/** The Kubernetes proxy: any write the portal sent itself would land here. */
const kubernetesProxy = jest.fn(async () => {
  throw new Error('the portal wrote to Kubernetes itself');
});

const Location = () => {
  const { pathname } = useLocation();
  return <p data-testid="location">{pathname}</p>;
};

async function renderModelPage(scenario: Partial<OrganizationsScenario>) {
  mockModel = model('claude-sonnet');
  mockListed = [mockModel, model('gpt', { marked: true })];
  const { api, callTool } = fakeOrganizationsMuster({
    mine: { organizations: [PAYMENTS] },
    ...scenario,
  });
  await renderInTestApp(
    <TestApiProvider
      apis={[
        [musterApiRef, api],
        [kubernetesApiRef, { proxy: kubernetesProxy } as never],
        [analyticsApiRef, mockApis.analytics.mock()],
      ]}
    >
      <DateTimeZoneProvider timeZone="local">
        <PageHeaderActionsProvider>
          <Routes>
            <Route path="/customize/models/*" element={<ModelsRouter />} />
            <Route path="/organizations/*" element={<Location />} />
          </Routes>
        </PageHeaderActionsProvider>
      </DateTimeZoneProvider>
    </TestApiProvider>,
    {
      initialRouteEntries: [
        `/customize/models/gazelle/${PAYMENTS.namespace}/claude-sonnet`,
      ],
      mountedRoutes: {
        '/customize/models': modelsRouteRef,
        '/customize': customizeExternalRouteRef,
        '/customize/agents': agentsRouteRef,
        '/organizations': organizationsRouteRef,
      },
    },
  );
  return callTool;
}

/**
 * The page's Set as default, once the organization directory has answered:
 * until then the model reads as one agent-manager asserts.
 */
async function setAsDefault() {
  const button = await screen.findByRole('button', { name: 'Set as default' });
  await waitFor(() => expect(button).toBeEnabled());
  return button;
}

beforeEach(() => kubernetesProxy.mockClear());

describe('ModelsRouter · Set as default on an organization model', () => {
  it('moves the mark through set_organization_model, writing no ModelConfig itself', async () => {
    const user = userEvent.setup();
    const callTool = await renderModelPage({ modelKeyPresent: true });

    await user.click(await setAsDefault());
    expect(
      screen.queryByText(/make it the default where agent-manager/),
    ).toBeNull();

    await waitFor(() =>
      expect(toolCalls(callTool, 'set_organization_model')).toEqual([
        {
          namespace: PAYMENTS.namespace,
          name: 'claude-sonnet',
          default: true,
          requestId: expect.any(String),
        },
      ]),
    );
    expect(kubernetesProxy).not.toHaveBeenCalled();
  });

  it('finishes on the credential form when the model has no key yet', async () => {
    const user = userEvent.setup();
    await renderModelPage({});

    await user.click(await setAsDefault());

    expect(await screen.findByTestId('location')).toHaveTextContent(
      `/organizations/gazelle/org-acme/payments/credentials/${CREDENTIAL_OPERATION}`,
    );
  });

  it('says who may set the default when agent-manager refuses the person', async () => {
    const user = userEvent.setup();
    await renderModelPage({
      modelError: `forbidden: you may not update modelconfigs in ${PAYMENTS.namespace}: agent-platform:admin grants it`,
    });

    await user.click(await setAsDefault());

    expect(await screen.findByText('Not permitted')).toBeInTheDocument();
    expect(
      screen.getByText(/Only an admin of the organization payments/),
    ).toBeInTheDocument();
  });
});
