import { useEffect, type ReactNode } from 'react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PageHeaderActionsProvider } from '@giantswarm/backstage-plugin-ui-react';

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
jest.mock('../InstallationSelect', () => ({
  InstallationSelect: function MockInstallationSelect({
    error,
  }: {
    error?: string;
  }) {
    const { state, setInstallation } = useNewAgentForm();
    useEffect(() => {
      if (!state.installation) {
        setInstallation('gazelle');
      }
    }, [state.installation, setInstallation]);
    return <p>installation select{error && `: ${error}`}</p>;
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
jest.mock('../TenantPicker', () => ({
  TenantPicker: () => <p>tenant picker</p>,
}));
jest.mock('../HarnessPicker', () => ({
  HarnessPicker: () => <p>runtime picker</p>,
}));
jest.mock('../DefaultWorkspacePicker', () => ({
  DefaultWorkspacePicker: () => <p>default workspace picker</p>,
}));
jest.mock('../CreateAgentAssist', () => ({ CreateAgentAssist: () => null }));
jest.mock('../AgentAvatarPreview', () => ({ AgentAvatarPreview: () => null }));

async function renderPage() {
  await renderInTestApp(
    <PageHeaderActionsProvider>
      <NewAgentFormProvider>
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

const moreOptions = () =>
  screen.getByText('More options').closest('details') as HTMLDetailsElement;

beforeEach(() => {
  mockNavigate.mockReset();
  mockPreselectedModel = 'Claude Sonnet';
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

    // Model, runtime, technical name and egress sit in the collapsed
    // disclosure.
    const details = moreOptions();
    expect(details.open).toBe(false);
    for (const inside of [
      screen.getByText('model picker'),
      screen.getByText('runtime picker'),
      screen.getByLabelText(/^Technical name/),
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
      'More options · Standard runtime, technical name support-triage',
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

  it('keeps More options closed for a problem outside it', async () => {
    await renderPage();

    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByText(/Enter a name for the agent/)).toBeInTheDocument();
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
});
