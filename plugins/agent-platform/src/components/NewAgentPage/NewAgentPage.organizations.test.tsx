import { useEffect } from 'react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { musterApiRef } from '@giantswarm/backstage-plugin-muster';

import {
  fakeOrganizationsMuster,
  toolCalls,
  type OrganizationsScenario,
} from '../../lib/__fixtures__/agentManagerOrganizations';
import type { AgentManagerModelConfig } from '../../lib/agentManager';
import {
  NewAgentFormProvider,
  useNewAgentForm,
  useTenantChoicesSync,
} from '../NewAgentFormProvider';
import { ModelConfigPicker } from '../ModelConfigPicker';
import { OrganizationDirectoryProvider } from '../OrganizationDirectoryProvider';
import { useOwnerField } from './hooks/useOwnerField';

// The environment's ModelConfigs as the cluster lists them: the platform's
// default model, which an organization's agent must not be offered.
jest.mock('../ModelConfigsProvider', () => ({
  useModelConfigs: () => ({
    isLoading: false,
    unreachableInstallations: [],
    modelConfigsFor: () => [
      {
        getName: () => 'default-model-config',
        getNamespace: () => 'kagent',
        getDisplayName: () => 'Platform Sonnet',
        getModel: () => 'claude-sonnet',
        getProvider: () => 'Anthropic',
      },
    ],
  }),
}));

const PAYMENTS = {
  namespace: 'agents-payments-x7k2q',
  organization: 'payments',
  parent: 'org-acme',
};
const RISK = {
  namespace: 'agents-risk-p3m9z',
  organization: 'risk',
  parent: 'org-acme',
};

function model(
  name: string,
  namespace: string,
  isDefault = false,
): AgentManagerModelConfig {
  return {
    name,
    namespace,
    provider: 'Anthropic',
    model: `${name}-model`,
    accepted: true,
    ...(isDefault ? { default: true } : {}),
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

async function renderStep(scenario: OrganizationsScenario) {
  const { api, callTool } = fakeOrganizationsMuster(scenario);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await renderInTestApp(
    <TestApiProvider apis={[[musterApiRef, api]]}>
      <QueryClientProvider client={queryClient}>
        <OrganizationDirectoryProvider>
          <NewAgentFormProvider>
            <Step />
          </NewAgentFormProvider>
        </OrganizationDirectoryProvider>
      </QueryClientProvider>
    </TestApiProvider>,
  );
  return { callTool };
}

describe('New agent: the organization picker', () => {
  it('preselects the only organization, offers no Platform, and starts with its default model', async () => {
    await renderStep({
      mine: { organizations: [PAYMENTS] },
      models: {
        [PAYMENTS.namespace]: [
          model('haiku', PAYMENTS.namespace),
          model('sonnet', PAYMENTS.namespace, true),
        ],
      },
    });

    expect(
      await screen.findByText(/the only organization you belong to on gazelle/),
    ).toHaveTextContent(/^Organization: payments,/);
    expect(
      await screen.findByRole('radio', {
        name: 'Select model sonnet, organization default',
      }),
    ).toHaveAttribute('aria-checked', 'true');
    // The platform's own default is never offered to an organization's agent.
    expect(screen.queryByText('Platform Sonnet')).toBeNull();
    expect(screen.queryByText(/Platform/)).toBeNull();
  });

  it("offers only the person's organizations, and the models follow the one chosen", async () => {
    const user = userEvent.setup();
    const { callTool } = await renderStep({
      mine: { organizations: [PAYMENTS, RISK] },
      models: {
        [PAYMENTS.namespace]: [model('sonnet', PAYMENTS.namespace, true)],
        [RISK.namespace]: [model('opus', RISK.namespace, true)],
      },
    });

    expect(
      await screen.findByRole('radio', {
        name: 'Select model sonnet, organization default',
      }),
    ).toHaveAttribute('aria-checked', 'true');
    await user.click(screen.getByRole('button', { name: /Organization$/ }));
    expect(
      screen.getAllByRole('option').map(option => option.textContent),
    ).toEqual(['payments', 'risk']);
    await user.click(screen.getByRole('option', { name: 'risk' }));

    expect(
      await screen.findByRole('radio', {
        name: 'Select model opus, organization default',
      }),
    ).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByText('sonnet')).toBeNull();
    await waitFor(() =>
      expect(toolCalls(callTool, 'list_model_configs')).toEqual([
        { namespace: PAYMENTS.namespace },
        { namespace: RISK.namespace },
      ]),
    );
  });

  it('tells the person to ask an admin when the organization has no default model', async () => {
    await renderStep({
      mine: { organizations: [PAYMENTS] },
      models: { [PAYMENTS.namespace]: [] },
    });

    expect(
      await screen.findByText('payments has no default model'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Ask an admin of payments to add one/),
    ).toBeInTheDocument();
  });

  it('tells a person in no organization who can add them, in agent-manager’s words', async () => {
    await renderStep({
      mine: {
        organizations: [],
        none: 'you belong to no organization: an admin of an organization adds you (add_organization_member), or someone with agent-platform:organizations-admin creates one with you as its first admin',
      },
    });

    expect(
      await screen.findByText('You belong to no organization on gazelle'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /^You belong to no organization: an admin of an organization adds you/,
      ),
    ).toBeInTheDocument();
  });
});
