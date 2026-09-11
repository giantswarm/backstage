import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Agent,
  AgentTemplateInterface,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { agentsRouteRef } from '../../routes';
import { AgentActionsMenu, type AgentManagerGate } from './AgentActionsMenu';

type AgentInterface = AgentTemplateInterface;

// The menu renders in the shared plugin header, outside the plugin's
// QueryClientProvider, so it calls no react-query hook itself: whether the write
// actions are offered arrives as a prop (feature detection from the MCPServer
// presence, read by the page), and the actions only ask the page to open the
// dialogs it renders in its body. This test is therefore about what the menu
// offers and says; the dialogs and hooks have their own tests.
function makeAgent(): Agent {
  return new Agent(
    {
      apiVersion: 'kagent.dev/v1alpha3',
      kind: 'AgentTemplate',
      metadata: {
        name: 'pr-reviewer',
        namespace: 'agent-platform',
        managedFields: [{ manager: 'helm-controller', operation: 'Apply' }],
      },
      spec: { modelConfig: { name: 'opus-4-7' } },
    } as AgentInterface,
    'gazelle',
  );
}

const onEdit = jest.fn();
const onUpdateSkills = jest.fn();
const onDelete = jest.fn();

const AVAILABLE: AgentManagerGate = {
  presence: 'available',
  isUnavailable: false,
};

const renderMenu = (agentManager: AgentManagerGate = AVAILABLE) =>
  renderInTestApp(
    <AgentActionsMenu
      agent={makeAgent()}
      agentManager={agentManager}
      onEdit={onEdit}
      onUpdateSkills={onUpdateSkills}
      onDelete={onDelete}
    />,
    { mountedRoutes: { '/agent-platform/agents': agentsRouteRef } },
  );

async function openMenu() {
  await userEvent.click(screen.getByRole('button', { name: 'Agent actions' }));
}

beforeEach(() => {
  onEdit.mockReset();
  onUpdateSkills.mockReset();
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
    expect(screen.getByText('pr-reviewer.yaml')).toBeInTheDocument();
  });

  it('offers Edit, Update skills and Delete when the installation has agent-manager, and asks the page to open them', async () => {
    await renderMenu();
    await openMenu();

    await userEvent.click(screen.getByRole('menuitem', { name: /Edit agent/ }));
    expect(onEdit).toHaveBeenCalledTimes(1);

    await openMenu();
    await userEvent.click(
      screen.getByRole('menuitem', { name: /Update skills/ }),
    );
    expect(onUpdateSkills).toHaveBeenCalledTimes(1);

    await openMenu();
    await userEvent.click(
      screen.getByRole('menuitem', { name: /Delete agent/ }),
    );
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('offers none of the three and says why when muster lists no agent-manager', async () => {
    await renderMenu({ presence: 'missing', isUnavailable: false });
    await openMenu();

    expect(
      screen.queryByRole('menuitem', { name: /Delete agent/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: /Edit agent/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: /Update skills/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', {
        name: /muster on gazelle lists no agent-manager/,
      }),
    ).toHaveAttribute('aria-disabled', 'true');
    // The read-only escape hatch stays.
    expect(
      screen.getByRole('menuitem', { name: 'View manifest' }),
    ).toBeInTheDocument();
  });

  it('says the muster plugin is missing when the portal has none', async () => {
    await renderMenu({ presence: 'unknown', isUnavailable: true });
    await openMenu();

    expect(
      screen.getByRole('menuitem', { name: /no muster plugin/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: /Delete agent/ }),
    ).not.toBeInTheDocument();
  });

  it('withholds the actions while the server list is still being read, without a reason', async () => {
    // Rather than offering them and taking them away again once muster answers.
    await renderMenu({ presence: 'unknown', isUnavailable: false });
    await openMenu();

    expect(screen.getAllByRole('menuitem')).toHaveLength(1);
    expect(
      screen.getByRole('menuitem', { name: 'View manifest' }),
    ).toBeInTheDocument();
  });
});
