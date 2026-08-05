import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { crds } from '@giantswarm/k8s-types';
import { Agent } from '@giantswarm/backstage-plugin-kubernetes-react';
import { agentsRouteRef } from '../../routes';
import type { UseDeleteAgentResult } from '../../hooks/useDeleteAgent';
import { AgentActionsMenu } from './AgentActionsMenu';

type AgentInterface = crds.kagent.v1alpha2.Agent;

// The delete state arrives as a prop — the menu renders in the shared plugin
// header, outside the plugin's QueryClientProvider, so it cannot call the hook
// itself. This test is therefore about what the menu offers and what it does with
// the outcome; the checks behind `isDeletable` are covered by
// useDeleteAgent.test.tsx.
const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

const mockToastPost = jest.fn();

// Only the toast API is swapped out — everything else the test app looks up
// (themes, route resolution) has to keep working.
jest.mock('@backstage/frontend-plugin-api', () => {
  const actual = jest.requireActual('@backstage/frontend-plugin-api');

  return {
    ...actual,
    useApi: (ref: unknown) =>
      ref === actual.toastApiRef ? { post: mockToastPost } : actual.useApi(ref),
  };
});

function makeAgent(): Agent {
  return new Agent(
    {
      apiVersion: 'kagent.dev/v1alpha2',
      kind: 'Agent',
      metadata: {
        name: 'pr-reviewer',
        namespace: 'agentic-platform',
        managedFields: [{ manager: 'helm-controller', operation: 'Apply' }],
      },
      spec: {
        type: 'Declarative',
        declarative: { modelConfig: 'opus-4-7' },
      },
    } as AgentInterface,
    'gazelle',
  );
}

const deleteAgent = jest.fn();
const reset = jest.fn();

let deletion: UseDeleteAgentResult;

function setDeleteState(overrides: Partial<UseDeleteAgentResult> = {}) {
  deletion = {
    isDeletable: true,
    isCheckingDeletable: false,
    deleteAgent,
    isDeleting: false,
    error: null,
    reset,
    ...overrides,
  } as UseDeleteAgentResult;
}

const renderMenu = () =>
  renderInTestApp(
    <AgentActionsMenu agent={makeAgent()} deletion={deletion} />,
    { mountedRoutes: { '/agent-platform/agents': agentsRouteRef } },
  );

async function openMenu() {
  await userEvent.click(screen.getByRole('button', { name: 'Agent actions' }));
}

beforeEach(() => {
  mockNavigate.mockReset();
  mockToastPost.mockReset();
  deleteAgent.mockReset();
  deleteAgent.mockResolvedValue(undefined);
  reset.mockReset();
  setDeleteState();
});

describe('AgentActionsMenu', () => {
  it('renders without a QueryClient in scope', async () => {
    // The regression this file exists to prevent. The menu is rendered into the
    // shared plugin header, which is outside the plugin's QueryClientProvider, so
    // a react-query hook called here throws "No QueryClient set" and takes the
    // whole page down with it — the delete state has to arrive as a prop.
    // `renderInTestApp` deliberately provides no client, so this asserts it.
    await renderMenu();

    expect(
      screen.getByRole('button', { name: 'Agent actions' }),
    ).toBeInTheDocument();
  });

  it('opens the manifest dialog from the kebab menu', async () => {
    await renderMenu();

    // Nothing is shown until asked for — this is the rarely-needed escape hatch.
    expect(screen.queryByText('Agent manifest')).not.toBeInTheDocument();

    await openMenu();
    await userEvent.click(
      screen.getByRole('menuitem', { name: 'View manifest' }),
    );

    await waitFor(() => {
      expect(screen.getByText('Agent manifest')).toBeInTheDocument();
    });
    expect(screen.getByText('pr-reviewer.yaml')).toBeInTheDocument();
    // Names the installation and namespace, so a manifest copied out of here can
    // be traced back to where it came from.
    expect(screen.getByText('gazelle · agentic-platform')).toBeInTheDocument();
  });

  it('hides the deletion from someone who may not perform it', async () => {
    setDeleteState({ isDeletable: false });
    await renderMenu();
    await openMenu();

    expect(
      screen.queryByRole('menuitem', { name: /Delete agent/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'View manifest' }),
    ).toBeInTheDocument();
  });

  it('withholds the deletion while the checks are still running', async () => {
    // Rather than offering it and taking it away again once the access review
    // comes back.
    setDeleteState({ isDeletable: true, isCheckingDeletable: true });
    await renderMenu();
    await openMenu();

    expect(
      screen.queryByRole('menuitem', { name: /Delete agent/ }),
    ).not.toBeInTheDocument();
  });

  it('warns about invisible sessions before deleting', async () => {
    await renderMenu();
    await openMenu();
    await userEvent.click(
      screen.getByRole('menuitem', { name: /Delete agent/ }),
    );

    await waitFor(() => {
      expect(
        screen.getByText('Delete agent "pr-reviewer"?'),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByText(/including sessions started by other people/),
    ).toBeInTheDocument();
    // Opening the dialog does not delete anything.
    expect(deleteAgent).not.toHaveBeenCalled();
  });

  it('confirms, reports and returns to the list on success', async () => {
    await renderMenu();
    await openMenu();
    await userEvent.click(
      screen.getByRole('menuitem', { name: /Delete agent/ }),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Delete agent' }),
    );

    await waitFor(() => {
      expect(deleteAgent).toHaveBeenCalledTimes(1);
    });

    expect(mockToastPost).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'success',
        // Permanent unless a timeout is given, and this is an acknowledgement.
        timeout: expect.any(Number),
      }),
    );
    // Not "deleted": the release has a finalizer, so the agent can still be in
    // the list for a few seconds.
    expect(mockToastPost.mock.calls[0][0].title).toMatch(
      /Deleting agent "pr-reviewer"/,
    );
    expect(mockNavigate).toHaveBeenCalledWith('/agent-platform/agents');

    await waitFor(() => {
      expect(
        screen.queryByText('Delete agent "pr-reviewer"?'),
      ).not.toBeInTheDocument();
    });
  });

  it('keeps the dialog open and says nothing succeeded when the delete fails', async () => {
    deleteAgent.mockRejectedValue(new Error('helmreleases is forbidden'));
    setDeleteState({ error: new Error('helmreleases is forbidden') });

    await renderMenu();
    await openMenu();
    await userEvent.click(
      screen.getByRole('menuitem', { name: /Delete agent/ }),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Delete agent' }),
    );

    await waitFor(() => {
      expect(deleteAgent).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByText('Delete agent "pr-reviewer"?')).toBeInTheDocument();
    expect(screen.getByText('helmreleases is forbidden')).toBeInTheDocument();
    expect(mockToastPost).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('clears a previous failure when the dialog is reopened', async () => {
    await renderMenu();
    await openMenu();
    await userEvent.click(
      screen.getByRole('menuitem', { name: /Delete agent/ }),
    );

    expect(reset).toHaveBeenCalled();
  });
});
