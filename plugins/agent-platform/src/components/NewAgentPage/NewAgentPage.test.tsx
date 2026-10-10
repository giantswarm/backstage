import type { ReactNode } from 'react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PageHeaderActionsProvider } from '@giantswarm/backstage-plugin-ui-react';

import { agentsRouteRef } from '../../routes';
import { NewAgentFormProvider } from '../NewAgentFormProvider';
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
// decides where they sit, so they render as markers.
jest.mock('../ModelConfigsProvider', () => ({
  ModelConfigsProvider: ({ children }: { children: ReactNode }) => children,
}));
jest.mock('../InstallationSelect', () => ({
  InstallationSelect: () => <p>installation select</p>,
}));
jest.mock('../ModelConfigPicker', () => ({
  ModelConfigPicker: () => <p>model picker</p>,
}));
jest.mock('../HarnessPicker', () => ({
  HarnessPicker: () => <p>runtime picker</p>,
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
    { mountedRoutes: { '/agent-platform/agents': agentsRouteRef } },
  );
}

const moreOptions = () =>
  screen.getByText('More options').closest('details') as HTMLDetailsElement;

beforeEach(() => {
  mockNavigate.mockReset();
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
    // The model stays a plain, visible choice.
    expect(screen.getByText('model picker').closest('details')).toBeNull();

    // Runtime, technical name and egress sit in the collapsed disclosure.
    const details = moreOptions();
    expect(details.open).toBe(false);
    for (const inside of [
      screen.getByText('runtime picker'),
      screen.getByLabelText(/^Technical name/),
      screen.getByLabelText(/^Extra egress origins/),
    ]) {
      expect(inside.closest('details')).toBe(details);
    }
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
  });

  it('opens More options when a field inside it blocks Continue', async () => {
    await renderPage();

    await userEvent.type(screen.getByLabelText(/^Name/), 'Support triage');
    const technicalName = screen.getByLabelText(/^Technical name/);
    await userEvent.clear(technicalName);
    await userEvent.type(technicalName, 'Not A Slug');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(moreOptions().open).toBe(true);
    expect(
      screen.getByText(/Technical name must be lowercase letters/),
    ).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('keeps More options closed for a problem outside it', async () => {
    await renderPage();

    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByText(/Name is required/)).toBeInTheDocument();
    expect(moreOptions().open).toBe(false);
  });
});
