import {
  useEffect,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PageHeaderActionsProvider } from '@giantswarm/backstage-plugin-ui-react';

import { formStateOfAgent } from '../../lib/agentEdit';
import type { AgentManagerAgent } from '../../lib/agentManager';
import type { HarnessChoice } from '../../lib/harnesses';
import { agentsRouteRef, customizeExternalRouteRef } from '../../routes';
import { NewAgentFormProvider, useNewAgentForm } from '../NewAgentFormProvider';
import { NewAgentPage } from './NewAgentPage';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock('../../hooks/useSkillCatalog', () => ({
  useSkillCatalog: () => ({ hasRepositories: true }),
}));

// The pickers read installations, ModelConfigs and Harnesses; this page only
// decides where they sit, so they render as markers. The installation and
// model markers pick what the real ones would preselect on a portal with one
// installation whose default model is `mockPreselectedModel`.
let mockPreselectedModel: string | undefined;
jest.mock('../ModelConfigsProvider', () => ({
  ModelConfigsProvider: ({ children }: { children: ReactNode }) => children,
  useModelConfigs: () => ({ isLoading: false, modelConfigsFor: () => [] }),
}));
// Where each field's hook says its field goes, and whether the environment
// one picks an installation (a default, or the sole one).
// What each field's hook renders: nothing, a choice (which holds the pair in
// the main form), or a line.
type MockKind = 'none' | 'choice' | 'line' | 'alone';
let mockEnvironment: MockKind;
let mockPicksInstallation: boolean;
let mockOrganization: MockKind;
const mockField = (kind: MockKind, text: string) => ({
  inMain: kind === 'choice',
  alone: kind === 'alone',
  field: kind === 'none' ? null : <p>{text}</p>,
});
jest.mock('./useEnvironmentField', () => ({
  useEnvironmentField: function useMockEnvironmentField({
    error,
  }: {
    error?: string;
  }) {
    const { state, edit, setInstallation } = useNewAgentForm();
    useEffect(() => {
      if (!edit && mockPicksInstallation && !state.installation) {
        setInstallation('gazelle');
      }
    }, [edit, state.installation, setInstallation]);
    return mockField(
      edit ? 'none' : mockEnvironment,
      `installation select${error ? `: ${error}` : ''}`,
    );
  },
}));
jest.mock('../ModelConfigPicker', () => ({
  ModelConfigPicker: function MockModelConfigPicker({
    error,
  }: {
    error?: string;
  }) {
    const { state, selectModelConfig } = useNewAgentForm();
    useEffect(() => {
      if (
        mockPreselectedModel &&
        state.installation &&
        !state.modelConfigName
      ) {
        selectModelConfig(
          'default-model-config',
          'kagent',
          mockPreselectedModel,
        );
      }
    }, [state.installation, state.modelConfigName, selectModelConfig]);
    return <p>model picker{error && `: ${error}`}</p>;
  },
}));
jest.mock('./useOrganizationField', () => ({
  soleOrganizationLabel: () => 'acme',
  useOrganizationField: () => ({
    ...mockField(mockOrganization, 'tenant picker'),
    sole: mockOrganization === 'line' ? 'org-acme' : undefined,
  }),
}));
let mockHarnessChoices: HarnessChoice[] = [];
let mockPlatformChoice: HarnessChoice | undefined;
// The runtime marker can pick a coding Harness, which takes the extra egress
// origins field away.
jest.mock('../HarnessPicker', () => ({
  HarnessPicker: function MockHarnessPicker() {
    const { selectHarness } = useNewAgentForm();
    return (
      <button
        type="button"
        onClick={() => selectHarness({ name: 'claude', runtime: 'claude' })}
      >
        runtime picker
      </button>
    );
  },
  // The namespace's Harnesses, for an edited agent's runtime; the platform
  // Harness not read unless a test reads it (the summary then names it by its
  // mark).
  useRuntimeChoices: () => ({
    choices: mockHarnessChoices,
    platformHarness: mockPlatformChoice?.name ?? 'kagent',
    platformChoice: mockPlatformChoice,
  }),
}));
jest.mock('../../hooks/useAgentManager', () => ({
  useAgentManagerInfo: () => ({
    info: undefined,
    isLoading: false,
    error: null,
  }),
}));
jest.mock('../DefaultWorkspacePicker', () => ({
  DefaultWorkspacePicker: () => <p>default workspace picker</p>,
}));
jest.mock('../EgressPolicyPicker', () => ({
  EgressPolicyPicker: () => <p>egress policy picker</p>,
}));
jest.mock('../CreateAgentAssist', () => ({ CreateAgentAssist: () => null }));
jest.mock('../AgentAvatarPreview', () => ({ AgentAvatarPreview: () => null }));

async function renderPage(
  provider: Omit<ComponentProps<typeof NewAgentFormProvider>, 'children'> = {},
) {
  await renderInTestApp(
    <PageHeaderActionsProvider>
      <NewAgentFormProvider {...provider}>
        <NewAgentPage />
      </NewAgentFormProvider>
    </PageHeaderActionsProvider>,
    {
      mountedRoutes: {
        '/customize/agents': agentsRouteRef,
        '/customize': customizeExternalRouteRef,
      },
    },
  );
}

/** The page, with a rerender that keeps the form's state. */
async function renderPageWithRerender() {
  let bump: () => void = () => {};
  function Rerenderable() {
    const [, setTick] = useState(0);
    bump = () => setTick(tick => tick + 1);
    return <NewAgentPage />;
  }
  await renderInTestApp(
    <PageHeaderActionsProvider>
      <NewAgentFormProvider>
        <Rerenderable />
      </NewAgentFormProvider>
    </PageHeaderActionsProvider>,
    {
      mountedRoutes: {
        '/customize/agents': agentsRouteRef,
        '/customize': customizeExternalRouteRef,
      },
    },
  );
  return { rerender: () => act(() => bump()) };
}

const moreOptions = () =>
  screen.getByText('More options').closest('details') as HTMLDetailsElement;

beforeEach(() => {
  mockNavigate.mockReset();
  mockPreselectedModel = 'Claude Sonnet';
  mockHarnessChoices = [];
  mockPlatformChoice = undefined;
  // A single-installation portal: the sole one picked, the field nowhere.
  mockEnvironment = 'none';
  mockPicksInstallation = true;
  mockOrganization = 'choice';
});

describe('NewAgentPage', () => {
  it('leads with the plain fields and keeps the technical knobs behind More options', async () => {
    await renderPage();

    expect(
      screen.getByRole('heading', { name: 'Describe your agent' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^Name/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^What is it for\?/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Instructions/)).toBeInTheDocument();

    // Model, runtime, technical name, EgressPolicies and egress sit in the
    // collapsed disclosure.
    const details = moreOptions();
    expect(details.open).toBe(false);
    for (const inside of [
      screen.getByText('model picker'),
      screen.getByText('runtime picker'),
      screen.getByLabelText(/^Technical name/),
      screen.getByText('egress policy picker'),
      screen.getByLabelText(/^Extra egress origins/),
    ]) {
      expect(inside.closest('details')).toBe(details);
    }
  });

  it('leaves without asking while only the preselections are made', async () => {
    await renderPage();
    await screen.findByText(
      'Runs on Claude Sonnet · change under More options',
    );

    await userEvent.click(screen.getByRole('link', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('asks before Cancel discards a typed agent', async () => {
    await renderPage();

    await userEvent.type(screen.getByLabelText(/^Name/), 'Notes');
    await userEvent.click(screen.getByRole('link', { name: 'Cancel' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Discard your changes?');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Discard changes' }),
    );

    // Leaving lands on the Customize screen's Agents tab.
    expect(mockNavigate).toHaveBeenCalledWith('/customize/agents');
  });

  it('names the preselected model under the plain fields', async () => {
    await renderPage();

    const summary = await screen.findByText(
      'Runs on Claude Sonnet · change under More options',
    );
    expect(summary.closest('details')).toBeNull();
  });

  it('says no model is picked yet when the installation offers none', async () => {
    mockPreselectedModel = undefined;
    await renderPage();

    expect(
      await screen.findByText(
        'No model picked yet · choose one under More options',
      ),
    ).toBeInTheDocument();
  });

  it('opens More options when no model is picked and Continue is pressed', async () => {
    mockPreselectedModel = undefined;
    await renderPage();

    await userEvent.type(screen.getByLabelText(/^Name/), 'Support triage');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(moreOptions().open).toBe(true);
    // The picker itself carries the problem, inside the opened disclosure.
    expect(
      screen.getByText('model picker: Choose a model.'),
    ).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('fills the technical name from the name and sums up the defaults', async () => {
    await renderPage();

    await userEvent.type(screen.getByLabelText(/^Name/), 'Support triage');
    expect(screen.getByLabelText(/^Technical name/)).toHaveValue(
      'support-triage',
    );
    expect(moreOptions().querySelector('summary')).toHaveTextContent(
      'More options · Platform default runtime, technical name support-triage',
    );
    // The irreversible part is said beside the name, outside the
    // disclosure (M7).
    const consequence = screen.getByText((_, element) =>
      Boolean(
        element?.tagName === 'P' &&
        element.textContent ===
          'Its technical name is support-triage; it cannot be changed once the agent exists.',
      ),
    );
    expect(consequence.closest('details')).toBeNull();
  });

  it('opens More options when a field inside it blocks Continue', async () => {
    await renderPage();

    await userEvent.type(screen.getByLabelText(/^Name/), 'Support triage');
    const technicalName = screen.getByLabelText(/^Technical name/);
    await userEvent.clear(technicalName);
    await userEvent.type(technicalName, 'Not A Slug');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(moreOptions().open).toBe(true);
    // The field says what is wrong, right under it, and takes the focus.
    expect(technicalName).toHaveAttribute('aria-invalid', 'true');
    expect(technicalName).toHaveAccessibleDescription(
      expect.stringContaining('Technical name must be lowercase letters'),
    );
    expect(technicalName).toHaveFocus();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  describe('where Environment and Organization sit', () => {
    const inMoreOptions = (text: string) =>
      screen.getByText(text).closest('details') === moreOptions();
    const summary = () => moreOptions().querySelector('summary');

    it('keeps an organization choice in the main form on a single-installation portal', async () => {
      await renderPage();

      expect(screen.queryByText('installation select')).toBeNull();
      expect(inMoreOptions('tenant picker')).toBe(false);
      expect(summary()).not.toHaveTextContent(/environment|organization/);
    });

    it('names the only environment first under More options, whatever Organization does', async () => {
      mockEnvironment = 'alone';
      await renderPage();

      expect(inMoreOptions('installation select')).toBe(true);
      expect(inMoreOptions('tenant picker')).toBe(false);
      expect(summary()).not.toHaveTextContent(/environment/);
    });

    it('puts the only environment’s line before the sole organization’s', async () => {
      mockEnvironment = 'alone';
      mockOrganization = 'line';
      await renderPage();

      expect(inMoreOptions('installation select')).toBe(true);
      expect(screen.getByText('installation select').nextElementSibling).toBe(
        screen.getByText('tenant picker'),
      );
    });

    it('puts the sole organization’s line under More options, named in the summary', async () => {
      mockOrganization = 'line';
      await renderPage();

      expect(inMoreOptions('tenant picker')).toBe(true);
      expect(summary()).toHaveTextContent(
        'More options · Platform default runtime, organization acme',
      );
    });

    it('keeps both in the main form, Environment first, when the environment is a choice', async () => {
      mockEnvironment = 'choice';
      mockOrganization = 'line';
      await renderPage();

      const environment = screen.getByText('installation select');
      const organization = screen.getByText('tenant picker');
      expect(inMoreOptions('installation select')).toBe(false);
      expect(inMoreOptions('tenant picker')).toBe(false);
      expect(environment.nextElementSibling).toBe(organization);
      expect(summary()).not.toHaveTextContent(/environment|organization/);
    });

    it('keeps the environment’s line beside an organization choice in the main form', async () => {
      mockEnvironment = 'line';
      await renderPage();

      expect(inMoreOptions('installation select')).toBe(false);
      expect(inMoreOptions('tenant picker')).toBe(false);
    });

    it('puts both lines under More options when neither is a choice', async () => {
      mockEnvironment = 'line';
      mockOrganization = 'line';
      await renderPage();

      expect(screen.getByText('installation select').nextElementSibling).toBe(
        screen.getByText('tenant picker'),
      );
      expect(inMoreOptions('installation select')).toBe(true);
      expect(inMoreOptions('tenant picker')).toBe(true);
      expect(summary()).toHaveTextContent(
        'More options · Platform default runtime, organization acme',
      );
    });

    it('shows an environment problem on the field in the main form', async () => {
      mockEnvironment = 'choice';
      mockPicksInstallation = false;
      await renderPage();

      await userEvent.type(screen.getByLabelText(/^Name/), 'Support triage');
      await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

      expect(
        screen.getByText('installation select: Choose an environment.'),
      ).toBeInTheDocument();
      expect(inMoreOptions('installation select: Choose an environment.')).toBe(
        false,
      );
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  it('keeps More options closed for a problem outside it', async () => {
    await renderPage();

    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    // On the field itself: the live announcer may say it too, depending on
    // whether the blur's announcement lands before the press.
    expect(screen.getByLabelText(/^Name/)).toHaveAccessibleDescription(
      expect.stringContaining('Enter a name for the agent.'),
    );
    expect(moreOptions().open).toBe(false);
  });

  it('marks the empty Name itself, focuses it, and shows no summary box', async () => {
    await renderPage();

    const name = screen.getByLabelText(/^Name/);
    expect(name).not.toHaveAttribute('aria-invalid');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(name).toHaveAccessibleDescription(
      expect.stringContaining('Enter a name for the agent.'),
    );
    expect(name).toHaveFocus();
    expect(
      screen.queryByText(/Please fix the following/),
    ).not.toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();

    // Fixing it clears the field's error at once.
    await userEvent.type(name, 'Support triage');
    expect(name).not.toHaveAttribute('aria-invalid');
  });

  it('checks an egress origin when the person leaves the field, not while they type', async () => {
    await renderPage();
    await userEvent.click(screen.getByText('More options'));
    const egress = screen.getByLabelText(/^Extra egress origins/);

    await userEvent.type(egress, 'github.com/x');
    expect(egress).not.toHaveAttribute('aria-invalid');

    await userEvent.tab();
    expect(egress).toHaveAttribute('aria-invalid', 'true');

    // Edited from one problem into another without passing a valid value:
    // the error stays, and follows the change.
    await userEvent.type(egress, '{Home}https://');
    expect(egress).toHaveValue('https://github.com/x');
    expect(egress).toHaveAttribute('aria-invalid', 'true');
    // The moment it is valid, the error goes.
    await userEvent.type(egress, '{End}{Backspace}{Backspace}');
    expect(egress).toHaveValue('https://github.com');
    expect(egress).not.toHaveAttribute('aria-invalid');
  });

  it('refuses a tls:// service without a port, naming why, and takes it with one', async () => {
    await renderPage();
    await userEvent.click(screen.getByText('More options'));
    const egress = screen.getByLabelText(/^Extra egress origins/);

    await userEvent.type(egress, 'tls://db.example.com');
    await userEvent.tab();
    expect(egress).toHaveAttribute('aria-invalid', 'true');
    expect(
      screen.getAllByText(
        /"tls:\/\/db\.example\.com" has no port: a tls:\/\/ origin requires one/,
      ).length,
    ).toBeGreaterThan(0);

    await userEvent.type(egress, ':5432');
    expect(egress).toHaveValue('tls://db.example.com:5432');
    expect(egress).not.toHaveAttribute('aria-invalid');
  });

  it('says nothing about an empty Name that was only tabbed through', async () => {
    await renderPage();
    const name = screen.getByLabelText(/^Name/);

    await userEvent.click(name);
    await userEvent.tab();

    expect(name).not.toHaveAttribute('aria-invalid');
    expect(
      screen.queryByText(/Enter a name for the agent/),
    ).not.toBeInTheDocument();
  });

  describe('on a coding Harness', () => {
    it('takes typed origins away with the move to one, and says so', async () => {
      await renderPage();
      await userEvent.click(screen.getByText('More options'));
      await userEvent.type(
        screen.getByLabelText(/^Extra egress origins/),
        'https://registry.npmjs.org',
      );

      await userEvent.click(screen.getByText('runtime picker'));

      expect(screen.queryByLabelText(/^Extra egress origins/)).toBeNull();
      expect(
        screen.getByText(
          'The platform sets what Claude Code agents may reach. Extra origins cannot be added.',
        ),
      ).toBeInTheDocument();
      const note = screen.getByRole('status');
      expect(
        within(note).getByText('Extra egress removed'),
      ).toBeInTheDocument();
      expect(
        within(note).getByText(
          'Claude Code agents reach only the addresses the platform allows, so the extra origin https://registry.npmjs.org was removed.',
        ),
      ).toBeInTheDocument();
    });

    it('says nothing was removed when nothing was typed', async () => {
      await renderPage();
      await userEvent.click(screen.getByText('More options'));

      await userEvent.click(screen.getByText('runtime picker'));

      expect(screen.queryByLabelText(/^Extra egress origins/)).toBeNull();
      expect(screen.queryByText('Extra egress removed')).toBeNull();
    });

    it('shows an edited agent’s network access as the platform’s, not as a field', async () => {
      mockHarnessChoices = [{ name: 'claude', runtime: 'claude' }];
      const agent: AgentManagerAgent = {
        name: 'coder',
        namespace: 'kagent',
        exists: true,
        ready: true,
        managed: 'helmrelease',
        displayName: 'Coder',
        modelConfig: 'default-model-config',
        harness: 'claude',
        egress: ['https://github.com'],
      };
      await renderPage({
        edit: {
          agent,
          installation: 'gazelle',
          writeMode: 'apply',
          detailHref: undefined,
        },
        initialState: formStateOfAgent(agent, {
          installation: 'gazelle',
          catalog: [],
          pluginCatalog: [],
          platformHarness: 'kagent',
        }),
      });
      await userEvent.click(screen.getByText('More options'));

      expect(screen.queryByLabelText(/^Extra egress origins/)).toBeNull();
      expect(
        screen.getByText(
          'The platform sets what Claude Code agents may reach. Extra origins cannot be added.',
        ),
      ).toBeInTheDocument();
    });

    it('keeps the field while a named Harness’s runtime is unknown', async () => {
      const agent: AgentManagerAgent = {
        name: 'coder',
        namespace: 'kagent',
        exists: true,
        ready: true,
        managed: 'helmrelease',
        modelConfig: 'default-model-config',
        harness: 'unread',
      };
      await renderPage({
        edit: {
          agent,
          installation: 'gazelle',
          writeMode: 'apply',
          detailHref: undefined,
        },
        initialState: formStateOfAgent(agent, {
          installation: 'gazelle',
          catalog: [],
          pluginCatalog: [],
          platformHarness: 'kagent',
        }),
      });
      await userEvent.click(screen.getByText('More options'));

      expect(
        screen.getByLabelText(/^Extra egress origins/),
      ).toBeInTheDocument();
      expect(screen.queryByText(/The platform sets/)).toBeNull();
    });

    it('reads the platform Harness’s runtime too, and drops what was typed once it is known', async () => {
      // The platform default read as a coding Harness after the person typed.
      const { rerender } = await renderPageWithRerender();
      await userEvent.click(screen.getByText('More options'));
      await userEvent.type(
        screen.getByLabelText(/^Extra egress origins/),
        'https://a.example.com{Enter}https://b.example.com',
      );

      mockPlatformChoice = { name: 'kagent', runtime: 'claude' };
      rerender();

      expect(
        await screen.findByText(
          'Claude Code agents reach only the addresses the platform allows, so the extra origins https://a.example.com and https://b.example.com were removed.',
        ),
      ).toBeInTheDocument();
      expect(screen.queryByLabelText(/^Extra egress origins/)).toBeNull();
    });

    it('does not check an edited agent’s egress the form does not show', async () => {
      mockHarnessChoices = [{ name: 'claude', runtime: 'claude' }];
      const agent: AgentManagerAgent = {
        name: 'coder',
        namespace: 'kagent',
        exists: true,
        ready: true,
        managed: 'helmrelease',
        displayName: 'Coder',
        modelConfig: 'default-model-config',
        harness: 'claude',
        // Not an origin the form would take: unseen, it must not block.
        egress: ['github.com/x'],
      };
      await renderPage({
        edit: {
          agent,
          installation: 'gazelle',
          writeMode: 'apply',
          detailHref: undefined,
        },
        initialState: formStateOfAgent(agent, {
          installation: 'gazelle',
          catalog: [],
          pluginCatalog: [],
          platformHarness: 'kagent',
        }),
      });

      await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

      expect(mockNavigate).toHaveBeenCalled();
      expect(screen.queryByText(/github\.com\/x/)).toBeNull();
    });
  });
});
