import type { ReactNode } from 'react';
import { Route, Routes } from 'react-router-dom';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { identityApiRef } from '@backstage/frontend-plugin-api';
import { mockApis, renderInTestApp } from '@backstage/frontend-test-utils';
import {
  PageHeaderActionsProvider,
  sessionDraftStorageKey,
} from '@giantswarm/backstage-plugin-ui-react';

import {
  agentsRouteRef,
  customizeExternalRouteRef,
  musterServersExternalRouteRef,
} from '../../routes';
import { NEW_AGENT_DRAFT_NAME, useNewAgentForm } from '../NewAgentFormProvider';
import { AgentsRouter } from './AgentsRouter';

// The create flow as the person meets it: the real form state with its draft,
// the real first step and its environment card with the links that lost the
// input in the UX test (giantswarm/giantswarm#38775). The other steps and the
// pickers that read the fleet are markers.

jest.mock('../QueryClientProvider', () => ({
  QueryClientProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));
jest.mock('../../hooks/useSkillCatalog', () => ({
  useSkillCatalog: () => ({ hasRepositories: false }),
}));
jest.mock('../ModelConfigsProvider', () => ({
  ModelConfigsProvider: ({ children }: { children: ReactNode }) => children,
  useModelConfigs: () => ({
    isLoading: false,
    hasInstallations: true,
    availableInstallations: ['alpha', 'beta'],
    unreachableInstallations: [],
    inaccessibleInstallations: [],
    modelConfigsFor: () => [],
  }),
}));
jest.mock('@giantswarm/backstage-plugin-gs', () => ({
  useInstallations: () => ({
    installations: [{ name: 'alpha' }, { name: 'beta' }],
    isLoading: false,
  }),
}));
// alpha is offered; beta's muster could not be read, so the card says so and
// links to signing in there.
jest.mock('../../hooks/useAgentManager', () => ({
  useAgentManagerAvailability: () => ({
    available: ['alpha'],
    missing: [],
    sharedIdentity: [],
    presenceOf: (name: string) => (name === 'alpha' ? 'available' : 'unknown'),
    isLoading: false,
    isUnavailable: false,
    recheck: () => Promise.resolve(),
  }),
}));
jest.mock('../ModelConfigPicker', () => ({ ModelConfigPicker: () => null }));
jest.mock('../TenantPicker', () => ({ TenantPicker: () => null }));
jest.mock('../HarnessPicker', () => ({ HarnessPicker: () => null }));
jest.mock('../DefaultWorkspacePicker', () => ({
  DefaultWorkspacePicker: () => null,
}));
jest.mock('../CreateAgentAssist', () => ({ CreateAgentAssist: () => null }));
jest.mock('../AgentAvatarPreview', () => ({ AgentAvatarPreview: () => null }));

/** Every name the Tools step was rendered with, in order. */
let toolsStepNames: string[] = [];
jest.mock('../NewAgentToolsPage', () => ({
  NewAgentToolsPage: function MockToolsStep() {
    const { state } = useNewAgentForm();
    toolsStepNames.push(state.name);
    return <p>{`tools step for "${state.name}"`}</p>;
  },
}));

const PERSON = 'user:default/alice';
const STORAGE_KEY = sessionDraftStorageKey(NEW_AGENT_DRAFT_NAME, PERSON);

function renderFlow(path = '/customize/agents/new') {
  return renderInTestApp(
    <PageHeaderActionsProvider>
      <Routes>
        <Route path="/customize/agents/*" element={<AgentsRouter />} />
      </Routes>
    </PageHeaderActionsProvider>,
    {
      initialRouteEntries: [path],
      apis: [[identityApiRef, mockApis.identity({ userEntityRef: PERSON })]],
      mountedRoutes: {
        '/customize/agents': agentsRouteRef,
        '/customize': customizeExternalRouteRef,
        '/customize/connectors': musterServersExternalRouteRef,
      },
    },
  );
}

const nameField = () => screen.findByLabelText(/^Name/);

beforeEach(() => {
  window.sessionStorage.clear();
  toolsStepNames = [];
});

describe('the new-agent draft', () => {
  it('keeps the input when a link in the environment card is followed', async () => {
    const { unmount } = await renderFlow();
    await userEvent.type(await nameField(), 'Support triage');

    // The link opens a new tab and says so: this one stays as it is.
    const link = screen.getByRole('link', {
      name: 'Sign in to muster (opens in a new tab)',
    });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    await userEvent.click(link);
    expect(await nameField()).toHaveValue('Support triage');

    // Followed in this tab anyway (a modified click, a link elsewhere on the
    // page): the form unmounts, and coming back brings the input with it.
    unmount();
    await renderFlow();
    expect(await nameField()).toHaveValue('Support triage');
  });

  it('restores the draft on return, and starts fresh on request', async () => {
    const { unmount } = await renderFlow();
    await userEvent.type(await nameField(), 'Support triage');
    await userEvent.type(
      screen.getByLabelText(/^What is it for\?/),
      'Routes tickets',
    );
    unmount();

    await renderFlow();
    expect(await nameField()).toHaveValue('Support triage');
    expect(screen.getByLabelText(/^What is it for\?/)).toHaveValue(
      'Routes tickets',
    );
    expect(screen.getByText('Your draft is back')).toBeInTheDocument();
    expect(
      screen.getByText(/kept in this browser tab until you create the agent/),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Start over' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Start over?');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Discard draft' }),
    );

    expect(await nameField()).toHaveValue('');
    expect(screen.getByLabelText(/^What is it for\?/)).toHaveValue('');
    expect(screen.queryByText('Your draft is back')).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('keeps the draft when its note is closed', async () => {
    const { unmount } = await renderFlow();
    await userEvent.type(await nameField(), 'Support triage');
    unmount();

    await renderFlow();
    await userEvent.click(await screen.findByRole('button', { name: 'Close' }));

    expect(screen.queryByText('Your draft is back')).not.toBeInTheDocument();
    expect(await nameField()).toHaveValue('Support triage');
    expect(window.sessionStorage.getItem(STORAGE_KEY)).not.toBeNull();
  });

  it('restores the draft after a reload, on the step it was on', async () => {
    const { unmount } = await renderFlow();
    await userEvent.type(await nameField(), 'Support triage');
    unmount();

    // A reload on a later step: the step waits for the draft rather than
    // meeting an empty form first.
    await renderFlow('/customize/agents/new/tools');

    expect(
      await screen.findByText('tools step for "Support triage"'),
    ).toBeInTheDocument();
    expect(toolsStepNames).not.toContain('');
  });

  it('drops the draft when the person discards their changes', async () => {
    await renderFlow();
    await userEvent.type(await nameField(), 'Support triage');
    expect(window.sessionStorage.getItem(STORAGE_KEY)).not.toBeNull();

    await userEvent.click(screen.getByRole('link', { name: 'Cancel' }));
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Discard changes',
      }),
    );

    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('keeps nothing for a form left untouched', async () => {
    await renderFlow();
    await nameField();

    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
