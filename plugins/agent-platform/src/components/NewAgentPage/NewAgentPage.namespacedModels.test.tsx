import { useEffect } from 'react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen } from '@testing-library/react';
// eslint-disable-next-line @backstage/no-mixed-plugin-imports -- agent-manager is read through the Muster API.
import { musterApiRef } from '@giantswarm/backstage-plugin-muster';

import { fakeOrganizationsMuster } from '../../lib/__fixtures__/agentManagerOrganizations';
import type { AgentManagerModelConfig } from '../../lib/agentManager';
import {
  NewAgentFormProvider,
  useNewAgentForm,
  useTenantChoicesSync,
} from '../NewAgentFormProvider';
import { ModelConfigPicker } from '../ModelConfigPicker';
import { ModelConfigsProvider } from '../ModelConfigsProvider';
import { OrganizationDirectoryProvider } from '../OrganizationDirectoryProvider';
import { useOwnerField } from './hooks/useOwnerField';

// One installation that runs kagent, as the gs inventory reports it.
jest.mock('@giantswarm/backstage-plugin-gs', () => ({
  ALL_INSTALLATIONS: 'all',
  applyInstallationScope: (installations: string[]) => installations,
  useInstallations: () => ({
    installations: [{ name: 'gazelle' }],
    isLoading: false,
  }),
  useInstallationInventory: () => ({
    entries: [],
    home: undefined,
    isLoading: false,
    isProbing: false,
    installationsWith: (component: string) =>
      component === 'kagent' ? ['gazelle'] : [],
    refresh: () => {},
  }),
  useInstallationScope: () => ({
    scope: 'all',
    setScope: () => {},
    installations: [],
    home: undefined,
    isSingleInstallation: false,
    isLoading: false,
  }),
}));

// The person's RBAC: a namespaced kagent RoleBinding, so the cluster-wide
// list of ModelConfigs is refused and the namespaces are read one by one;
// the platform namespace and the organization's answer, any other refuses.
const FORBIDDEN_CLUSTER_WIDE = {
  resources: [],
  clustersData: [],
  errors: [{ cluster: 'gazelle', error: { name: 'ForbiddenError' } }],
  isLoading: false,
};
let mockReadable: Record<string, unknown[]> = {};
jest.mock('@giantswarm/backstage-plugin-kubernetes-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-kubernetes-react'),
  useResources: () => FORBIDDEN_CLUSTER_WIDE,
  fetchResourceList: async ({ namespace }: { namespace: string }) => {
    if (!mockReadable[namespace]) {
      const error = new Error('modelconfigs is forbidden');
      error.name = 'ForbiddenError';
      throw error;
    }
    return mockReadable[namespace];
  },
}));

const PAYMENTS = {
  namespace: 'agents-payments-x7k2q',
  organization: 'payments',
};

function modelConfigJson(name: string, namespace: string) {
  return {
    apiVersion: 'api.kagent.dev/v1alpha3',
    kind: 'ModelConfig',
    metadata: { name, namespace },
    spec: { provider: 'Anthropic', model: `${name}-model` },
  };
}

function reported(name: string, namespace: string): AgentManagerModelConfig {
  return {
    name,
    namespace,
    provider: 'Anthropic',
    model: `${name}-model`,
    accepted: true,
    default: true,
  };
}

/** The Organization field and the model picker, as step 1 places them. */
function Step() {
  const { state, setInstallation } = useNewAgentForm();
  useTenantChoicesSync();
  const owner = useOwnerField();
  useEffect(() => {
    if (!state.installation) {
      setInstallation('gazelle');
    }
  }, [state.installation, setInstallation]);
  return state.installation ? (
    <>
      {owner.field}
      <ModelConfigPicker />
    </>
  ) : null;
}

describe('New agent: the models of an organization read namespace by namespace', () => {
  it('offers the models of an organization that agent-manager’s managed list does not name yet and that holds no Agent, with its default preselected', async () => {
    // agent-manager lists the organization with its namespace, but its
    // `get_info` names no managed namespace yet (the fake's default), and
    // no Agent is there for the controller to list.
    const { api } = fakeOrganizationsMuster({
      mine: { organizations: [PAYMENTS] },
      models: {
        [PAYMENTS.namespace]: [reported('sonnet', PAYMENTS.namespace)],
      },
    });
    mockReadable = {
      kagent: [],
      [PAYMENTS.namespace]: [modelConfigJson('sonnet', PAYMENTS.namespace)],
    };
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    await renderInTestApp(
      <TestApiProvider
        apis={[
          [musterApiRef, api],
          [kubernetesApiRef, {}],
        ]}
      >
        <QueryClientProvider client={queryClient}>
          <OrganizationDirectoryProvider>
            <NewAgentFormProvider>
              <ModelConfigsProvider>
                <Step />
              </ModelConfigsProvider>
            </NewAgentFormProvider>
          </OrganizationDirectoryProvider>
        </QueryClientProvider>
      </TestApiProvider>,
    );

    expect(
      await screen.findByText(/the only organization you belong to on gazelle/),
    ).toHaveTextContent(/^Organization: payments,/);
    expect(
      await screen.findByRole('radio', {
        name: 'Select model sonnet-model, default',
      }),
    ).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByText('No models found')).toBeNull();
  });
});
