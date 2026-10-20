import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Agent,
  AgentInterface,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { agentsRouteRef } from '../../routes';
import {
  AgentActionsMenu,
  agentManagerAbsenceReason,
  type AgentManagerGate,
} from './AgentActionsMenu';

// The menu renders in the shared plugin header, outside the plugin's
// QueryClientProvider, so it calls no react-query hook itself: whether the write
// actions are offered arrives as a prop (agent-manager's presence and its
// verdict on the agent, both read by the page), and the actions only ask the
// page to open the dialogs it renders in its body. This test is therefore about
// what the menu offers and says; the dialogs and hooks have their own tests.
function makeAgent(): Agent {
  return new Agent(
    {
      apiVersion: 'api.kagent.dev/v1alpha3',
      kind: 'Agent',
      metadata: {
        name: 'pr-reviewer',
        namespace: 'agent-platform',
        managedFields: [{ manager: 'helm-controller', operation: 'Apply' }],
      },
      spec: { template: { modelConfig: { name: 'opus-4-7' } } },
    } as AgentInterface,
    'gazelle',
  );
}

const onUpdateSkills = jest.fn();
const onChangeHarness = jest.fn();
const onDelete = jest.fn();

const AVAILABLE: AgentManagerGate = {
  presence: 'available',
  isUnavailable: false,
  isGitOpsOwned: false,
  canCommit: false,
  isVerdictPending: false,
};

const renderMenu = (agentManager: AgentManagerGate = AVAILABLE) =>
  renderInTestApp(
    <AgentActionsMenu
      agent={makeAgent()}
      agentManager={agentManager}
      onUpdateSkills={onUpdateSkills}
      onChangeHarness={onChangeHarness}
      onDelete={onDelete}
    />,
    { mountedRoutes: { '/customize/agents': agentsRouteRef } },
  );

async function openMenu() {
  await userEvent.click(screen.getByRole('button', { name: 'Agent actions' }));
}

beforeEach(() => {
  onUpdateSkills.mockReset();
  onChangeHarness.mockReset();
  onDelete.mockReset();
});

describe('AgentActionsMenu', () => {
  it('renders without a QueryClient in scope', async () => {
    // The regression this file exists to prevent: the menu is rendered into the
    // shared plugin header, outside the plugin's QueryClientProvider, so a
    // react-query hook called here throws "No QueryClient set" and takes the
    // whole page down with it. `renderInTestApp` deliberately provides no
    // client, so this asserts it.
    await renderMenu();

    expect(
      screen.getByRole('button', { name: 'Agent actions' }),
    ).toBeInTheDocument();
  });

  it('opens the manifest dialog from the kebab menu', async () => {
    await renderMenu();

    expect(screen.queryByText('Agent manifest')).not.toBeInTheDocument();

    await openMenu();
    await userEvent.click(
      screen.getByRole('menuitem', { name: 'View manifest' }),
    );

    await waitFor(() => {
      expect(screen.getByText('Agent manifest')).toBeInTheDocument();
    });
    expect(
      screen.getByRole('button', { name: 'Copy manifest' }),
    ).toBeInTheDocument();
  });

  it('offers Update all skills to latest, Change Harness and Delete when the installation has agent-manager, and asks the page to open them', async () => {
    await renderMenu();
    await openMenu();

    expect(
      screen.queryByRole('menuitem', { name: /Edit agent/ }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('menuitem', { name: 'Update all skills to latest…' }),
    );
    expect(onUpdateSkills).toHaveBeenCalledTimes(1);

    await openMenu();
    await userEvent.click(
      screen.getByRole('menuitem', { name: 'Change Harness…' }),
    );
    expect(onChangeHarness).toHaveBeenCalledTimes(1);

    await openMenu();
    await userEvent.click(
      screen.getByRole('menuitem', { name: /Delete agent/ }),
    );
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('offers each write only where the API server lets the person make it', async () => {
    // An editor who may update the release but not delete it.
    await renderMenu({ ...AVAILABLE, mayUpdate: true, mayDelete: false });
    await openMenu();

    expect(
      screen.getByRole('menuitem', { name: 'Update all skills to latest…' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: /Delete agent/ }),
    ).not.toBeInTheDocument();
  });

  it('withholds Change Harness, an update, from a person who may not update the release', async () => {
    await renderMenu({ ...AVAILABLE, mayUpdate: false, mayDelete: true });
    await openMenu();

    expect(
      screen.queryByRole('menuitem', { name: 'Change Harness…' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: 'Update all skills to latest…' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: /Delete agent/ }),
    ).toBeInTheDocument();
  });

  it('offers none of the three when muster lists no agent-manager', async () => {
    await renderMenu({
      presence: 'missing',
      isUnavailable: false,
      isGitOpsOwned: false,
      canCommit: false,
      isVerdictPending: false,
    });
    await openMenu();

    expect(
      screen.queryByRole('menuitem', { name: /Delete agent/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: /Edit agent/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: 'Update all skills to latest…' }),
    ).not.toBeInTheDocument();
    // The read-only escape hatch, and nothing else: a menu lists things to do,
    // so what cannot be offered is left out rather than explained in place.
    expect(screen.getAllByRole('menuitem')).toHaveLength(1);
    expect(
      screen.getByRole('menuitem', { name: 'View manifest' }),
    ).toBeInTheDocument();
  });

  it('offers none of the three for an agent applied from git', async () => {
    // agent-manager refuses every live write to it, so the actions are withheld
    // rather than opened and refused on confirm. No explanation here: the
    // Overview tab's "Managed through GitOps" card already carries it.
    await renderMenu({ ...AVAILABLE, isGitOpsOwned: true });
    await openMenu();

    expect(screen.getAllByRole('menuitem')).toHaveLength(1);
    expect(
      screen.getByRole('menuitem', { name: 'View manifest' }),
    ).toBeInTheDocument();
  });

  it('offers Update all skills to latest, Change Harness and Delete for an agent applied from git when agent-manager can commit', async () => {
    // All three go through a pull request in the GitOps repository then.
    await renderMenu({ ...AVAILABLE, isGitOpsOwned: true, canCommit: true });
    await openMenu();

    await userEvent.click(
      screen.getByRole('menuitem', { name: 'Update all skills to latest…' }),
    );
    expect(onUpdateSkills).toHaveBeenCalledTimes(1);
    await openMenu();
    await userEvent.click(
      screen.getByRole('menuitem', { name: 'Change Harness…' }),
    );
    expect(onChangeHarness).toHaveBeenCalledTimes(1);
    await openMenu();
    await userEvent.click(
      screen.getByRole('menuitem', { name: /Delete agent/ }),
    );
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("withholds the actions while agent-manager's verdict is still in flight", async () => {
    // Offering them for a muster round-trip and then taking them away is the
    // one window where a GitOps-owned agent could still be written to.
    await renderMenu({ ...AVAILABLE, isVerdictPending: true });
    await openMenu();

    expect(screen.getAllByRole('menuitem')).toHaveLength(1);
    expect(
      screen.getByRole('menuitem', { name: 'View manifest' }),
    ).toBeInTheDocument();
  });

  it('offers none of the three when the portal has no muster plugin', async () => {
    await renderMenu({
      presence: 'unknown',
      isUnavailable: true,
      isGitOpsOwned: false,
      canCommit: false,
      isVerdictPending: false,
    });
    await openMenu();

    expect(screen.getAllByRole('menuitem')).toHaveLength(1);
    expect(
      screen.queryByRole('menuitem', { name: /Delete agent/ }),
    ).not.toBeInTheDocument();
  });

  it('offers none of the three where muster runs under its shared identity, and says why', async () => {
    const gate: AgentManagerGate = {
      ...AVAILABLE,
      presence: 'sharedIdentity',
    };
    await renderMenu(gate);
    await openMenu();

    expect(screen.getAllByRole('menuitem')).toHaveLength(1);
    expect(
      screen.queryByRole('menuitem', { name: /Update all skills/ }),
    ).not.toBeInTheDocument();
    expect(agentManagerAbsenceReason(gate, 'gazelle')).toMatch(
      /muster on gazelle has no per-user sign-in in this portal/i,
    );
  });

  it('withholds the actions while the server list is still being read', async () => {
    // Rather than offering them and taking them away again once muster answers.
    await renderMenu({
      presence: 'unknown',
      isUnavailable: false,
      isGitOpsOwned: false,
      canCommit: false,
      isVerdictPending: false,
    });
    await openMenu();

    expect(screen.getAllByRole('menuitem')).toHaveLength(1);
    expect(
      screen.getByRole('menuitem', { name: 'View manifest' }),
    ).toBeInTheDocument();
  });
});
