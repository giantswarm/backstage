import { useEffect } from 'react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
// eslint-disable-next-line @backstage/no-mixed-plugin-imports -- Organization choices are read through the Muster API.
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
// default model, which an organization's agent must not be offered, and each
// organization's own (the scenario's). Which one is the default is
// agent-manager's answer (`list_model_configs`' `default`).
let mockListed: AgentManagerModelConfig[] = [];
jest.mock('../ModelConfigsProvider', () => ({
  useModelConfigs: () => ({
    isLoading: false,
    unreachableInstallations: [],
    modelConfigsFor: () =>
      [
        {
          name: 'default-model-config',
          namespace: 'kagent',
          model: 'claude-sonnet',
          provider: 'Anthropic',
        },
        ...mockListed,
      ].map(mc => ({
        getName: () => mc.name,
        getNamespace: () => mc.namespace,
        getDisplayName: () =>
          mc.namespace === 'kagent' ? 'Platform Sonnet' : mc.name,
        getDisplayNameAnnotation: () =>
          mc.namespace === 'kagent' ? 'Platform Sonnet' : undefined,
        isPersonalChatGptLogin: () => false,
        getModel: () => mc.model,
        getProvider: () => mc.provider,
      })),
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

/**
 * The Organization field and the model picker, as step 1 places them, and
 * what the form holds. `preselect` is picked before agent-manager answers,
 * as a page or a restored draft brings one.
 */
function Step({ preselect }: { preselect?: string }) {
  const { state, setInstallation, selectTenant, fieldErrors } =
    useNewAgentForm();
  useTenantChoicesSync();
  // Every problem shows at once, as after a blocked Continue.
  const owner = useOwnerField({ errorFor: (_field, problem) => problem });
  useEffect(() => {
    if (!state.installation) {
      setInstallation('gazelle');
    } else if (preselect && state.tenant === undefined) {
      selectTenant(preselect);
    }
  }, [
    state.installation,
    state.tenant,
    setInstallation,
    selectTenant,
    preselect,
  ]);
  return state.installation ? (
    <>
      {owner.field}
      <ModelConfigPicker />
      <output aria-label="form">
        {`tenant=${state.tenant ?? ''} error=${fieldErrors.tenant ?? ''}`}
      </output>
    </>
  ) : null;
}

async function renderStep(
  scenario: OrganizationsScenario,
  { preselect }: { preselect?: string } = {},
) {
  mockListed = Object.values(scenario.models ?? {}).flat();
  const { api, callTool } = fakeOrganizationsMuster(scenario);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await renderInTestApp(
    <TestApiProvider apis={[[musterApiRef, api]]}>
      <QueryClientProvider client={queryClient}>
        <OrganizationDirectoryProvider>
          <NewAgentFormProvider>
            <Step preselect={preselect} />
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
        name: 'Select model sonnet-model, default',
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
        name: 'Select model sonnet-model, default',
      }),
    ).toHaveAttribute('aria-checked', 'true');
    await user.click(screen.getByRole('button', { name: /Organization$/ }));
    expect(
      screen.getAllByRole('option').map(option => option.textContent),
    ).toEqual(['payments', 'risk']);
    await user.click(screen.getByRole('option', { name: 'risk' }));

    expect(
      await screen.findByRole('radio', {
        name: 'Select model opus-model, default',
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

    expect(await screen.findByText('No models found')).toBeInTheDocument();
    expect(
      screen.getByText(
        /No models for the payments organization on gazelle\. An admin must add one/,
      ),
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

  it("reads the person's organizations again on Check again after that read failed", async () => {
    const user = userEvent.setup();
    const { callTool } = await renderStep({
      mine: { organizations: [PAYMENTS] },
      mineFailures: 1,
      models: {
        [PAYMENTS.namespace]: [model('sonnet', PAYMENTS.namespace, true)],
      },
    });

    await user.click(
      await screen.findByRole('button', { name: 'Check again' }),
    );

    expect(
      await screen.findByText(/the only organization you belong to on gazelle/),
    ).toHaveTextContent(/^Organization: payments,/);
    expect(toolCalls(callTool, 'list_organizations')).toHaveLength(2);
  });
});

describe('New agent: organizations the person may not create agents in', () => {
  const models = {
    [PAYMENTS.namespace]: [model('sonnet', PAYMENTS.namespace, true)],
    [RISK.namespace]: [model('opus', RISK.namespace, true)],
  };
  const form = () => screen.getByRole('status', { name: 'form' });

  it('shows one without createAgents disabled, with the reason, and keeps the other picked', async () => {
    const user = userEvent.setup();
    await renderStep({
      mine: { organizations: [PAYMENTS, RISK] },
      createAgents: { [PAYMENTS.namespace]: true, [RISK.namespace]: false },
      models,
    });

    await waitFor(() =>
      expect(form()).toHaveTextContent(`tenant=${PAYMENTS.namespace} error=`),
    );
    // Said under the picker without opening it, and tied to it.
    const picker = screen.getByRole('button', { name: /Organization$/ });
    expect(picker).toHaveAccessibleDescription(
      expect.stringContaining(
        'You may not create agents in risk: you need the editor role there.',
      ),
    );
    await user.click(picker);
    const payments = screen.getByRole('option', { name: 'payments' });
    const risk = screen.getByRole('option', { name: 'risk' });
    expect(payments).not.toHaveAttribute('aria-disabled');
    expect(risk).toHaveAttribute('aria-disabled', 'true');
    expect(risk).toHaveAccessibleDescription(
      'Needs the editor role to create agents.',
    );

    // A press on it picks nothing.
    await user.click(risk);
    await user.keyboard('{Escape}');
    expect(form()).toHaveTextContent(`tenant=${PAYMENTS.namespace} error=`);
  });

  it('keeps an organization selectable when agent-manager does not say (no createAgents)', async () => {
    const user = userEvent.setup();
    await renderStep({
      mine: { organizations: [PAYMENTS, RISK] },
      // Only payments is answered; risk comes without the field, as from an
      // agent-manager older than it.
      createAgents: { [PAYMENTS.namespace]: true },
      models,
    });

    await user.click(
      await screen.findByRole('button', { name: /Organization$/ }),
    );
    const risk = screen.getByRole('option', { name: 'risk' });
    expect(risk).not.toHaveAttribute('aria-disabled');
    await user.click(risk);
    await waitFor(() =>
      expect(form()).toHaveTextContent(`tenant=${RISK.namespace} error=`),
    );
  });

  it('keeps the only organization a line when createAgents is true', async () => {
    await renderStep({
      mine: { organizations: [PAYMENTS] },
      createAgents: { [PAYMENTS.namespace]: true },
      models,
    });

    expect(
      await screen.findByText(/the only organization you belong to on gazelle/),
    ).toHaveTextContent(/^Organization: payments,/);
    expect(form()).toHaveTextContent(`tenant=${PAYMENTS.namespace} error=`);
  });

  it('says so, with no picker, when the person may create agents in none of their organizations', async () => {
    await renderStep({
      mine: { organizations: [PAYMENTS, RISK] },
      createAgents: { [PAYMENTS.namespace]: false, [RISK.namespace]: false },
      models,
    });

    expect(
      await screen.findByText(
        'You may not create agents in your organizations on gazelle',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'You belong to payments and risk, where you may use agents but not create them. Creating agents needs the editor role in an organization, which its admins can give you.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Organization$/ })).toBeNull();
    expect(form()).toHaveTextContent(
      'tenant= error=You may not create agents in your organizations on gazelle: that needs the editor role in an organization.',
    );
  });

  it('does not take a preselected organization the person may not create agents in, and says why', async () => {
    await renderStep(
      {
        mine: { organizations: [PAYMENTS, RISK] },
        createAgents: { [PAYMENTS.namespace]: true, [RISK.namespace]: false },
        models,
      },
      { preselect: RISK.namespace },
    );

    const problem =
      'You may not create agents in risk: you need the editor role there. Choose another organization, or ask an admin of risk for it.';
    await waitFor(() =>
      expect(form()).toHaveTextContent(
        `tenant=${RISK.namespace} error=${problem}`,
      ),
    );
    // Shown at the field, tied to it, without a Continue first.
    expect(
      screen.getByRole('button', { name: /Organization$/ }),
    ).toHaveAccessibleDescription(expect.stringContaining(problem));
  });

  it('does not take a preselected organization where the person may create agents in none, and offers no other', async () => {
    await renderStep(
      {
        mine: { organizations: [PAYMENTS, RISK] },
        createAgents: { [PAYMENTS.namespace]: false, [RISK.namespace]: false },
        models,
      },
      { preselect: RISK.namespace },
    );

    await waitFor(() =>
      expect(form()).toHaveTextContent(
        `tenant=${RISK.namespace} error=You may not create agents in your organizations on gazelle: that needs the editor role in an organization. Choose another environment`,
      ),
    );
    expect(
      screen.getByText(
        'You may not create agents in your organizations on gazelle',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Organization$/ })).toBeNull();
  });
});
