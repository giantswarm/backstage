import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { AgentManagerEgressPolicy } from '../../lib/agentManager';
import type { HarnessChoice } from '../../lib/harnesses';
import {
  NewAgentFormProvider,
  useNewAgentForm,
  type NewAgentFormState,
} from '../NewAgentFormProvider';
import { EgressPolicyPicker } from './EgressPolicyPicker';

const GITHUB: AgentManagerEgressPolicy = {
  name: 'github',
  namespace: 'org-otter',
  destinations: [
    { origin: 'https://github.com' },
    { origin: 'https://api.github.com', credentialHeader: 'Authorization' },
  ],
};
const GO_MODULES: AgentManagerEgressPolicy = {
  name: 'go-modules',
  namespace: 'org-otter',
  destinations: [{ origin: 'https://proxy.golang.org' }],
};

let mockPolicies: {
  supported: boolean;
  egressPolicies: AgentManagerEgressPolicy[];
  isLoading: boolean;
};
jest.mock('../../hooks/useAgentManagerEgressPolicies', () => ({
  useAgentManagerEgressPolicies: () => mockPolicies,
}));

let mockHarnesses: HarnessChoice[] = [];
jest.mock('../../hooks/useHarnessChoices', () => ({
  useHarnessChoices: () => ({
    choices: mockHarnesses,
    platformHarness: 'kagent',
    platformChoice: mockHarnesses.find(choice => choice.name === 'kagent'),
    errors: [],
    isLoading: false,
  }),
}));
// The runtime is read where the runtime field reads it, which asks get_info
// for the platform namespace.
jest.mock('../../hooks/useAgentManager', () => ({
  useAgentManagerInfo: () => ({
    info: undefined,
    isLoading: false,
    error: null,
  }),
}));

const STATE: NewAgentFormState = {
  name: 'Builder',
  slug: 'builder',
  description: '',
  installation: 'gazelle',
  tenant: 'org-otter',
  modelConfigName: 'sonnet',
  modelConfigNamespace: 'org-otter',
  modelDisplayName: undefined,
  harness: undefined,
  droppedHarness: undefined,
  systemMessage: '',
  egressText: '',
  egressPolicyRefs: [],
  defaultWorkspace: '',
  selectedSkills: [],
  keptSkills: [],
  selectedPlugins: [],
  keptPlugins: [],
  toolset: [],
};

const CLAUDE: HarnessChoice = { name: 'claude-code', runtime: 'claude' };

/** What the wizard would send, and a way to move to a coding Harness. */
function Probe() {
  const { state, selectHarness } = useNewAgentForm();
  return (
    <>
      <output data-testid="refs">{state.egressPolicyRefs.join(',')}</output>
      <button type="button" onClick={() => selectHarness(CLAUDE)}>
        Use Claude Code
      </button>
    </>
  );
}

async function renderPicker(state: Partial<NewAgentFormState> = {}) {
  await renderInTestApp(
    <NewAgentFormProvider initialState={{ ...STATE, ...state }}>
      <EgressPolicyPicker />
      <Probe />
    </NewAgentFormProvider>,
  );
}

describe('EgressPolicyPicker', () => {
  beforeEach(() => {
    mockPolicies = {
      supported: true,
      egressPolicies: [GITHUB, GO_MODULES],
      isLoading: false,
    };
    mockHarnesses = [];
  });

  it("lists the namespace's EgressPolicies with their origins and picks them by name", async () => {
    await renderPicker();

    expect(screen.getByText('EgressPolicies')).toBeInTheDocument();
    expect(screen.getByText('2 origins')).toBeInTheDocument();
    expect(
      screen.getByText(
        'https://github.com · https://api.github.com (adds Authorization)',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/the gateway adds it/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('checkbox', { name: /go-modules/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /github/ }));
    expect(screen.getByTestId('refs')).toHaveTextContent('go-modules,github');

    await userEvent.click(screen.getByRole('checkbox', { name: /go-modules/ }));
    expect(screen.getByTestId('refs')).toHaveTextContent(/^github$/);
  });

  it('says so when the namespace holds no EgressPolicy', async () => {
    mockPolicies.egressPolicies = [];
    await renderPicker();

    expect(
      screen.getByText(
        'No EgressPolicies in org-otter. The otter organization’s admins can add them.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('offers nothing where agent-manager takes no egressPolicyRefs', async () => {
    mockPolicies.supported = false;
    await renderPicker();

    expect(screen.queryByText('EgressPolicies')).not.toBeInTheDocument();
  });

  it('offers nothing on a coding Harness, and a move to one drops the picks', async () => {
    await renderPicker({ egressPolicyRefs: ['github'] });
    expect(screen.getByRole('checkbox', { name: /github/ })).toBeChecked();

    await userEvent.click(
      screen.getByRole('button', { name: 'Use Claude Code' }),
    );
    expect(screen.queryByText('EgressPolicies')).not.toBeInTheDocument();
    expect(screen.getByTestId('refs')).toBeEmptyDOMElement();
  });

  it('waits for the runtime of a Harness other than the platform one', async () => {
    await renderPicker({ harness: { name: 'claude-code' } });
    expect(screen.queryByText('EgressPolicies')).not.toBeInTheDocument();
  });

  it('keeps a pick the namespace no longer holds, so it is removed on purpose', async () => {
    await renderPicker({ egressPolicyRefs: ['github', 'gone'] });

    const gone = screen.getByRole('checkbox', { name: /gone/ });
    expect(gone).toBeChecked();
    expect(screen.getByText(/Not in org-otter any more/)).toBeInTheDocument();

    await userEvent.click(gone);
    expect(screen.getByTestId('refs')).toHaveTextContent(/^github$/);
  });
});
