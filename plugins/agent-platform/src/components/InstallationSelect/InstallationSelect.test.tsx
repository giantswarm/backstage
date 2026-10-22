import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InstallationSelect } from './InstallationSelect';

type FormState = { installation: string | undefined };

let mockState: FormState;
const mockSetInstallation = jest.fn();

let mockInstallations: { name: string }[];
let mockIsLoadingInstallations: boolean;

let mockModelConfigs: {
  isLoading: boolean;
  hasInstallations: boolean;
  availableInstallations: string[];
  unreachableInstallations: string[];
  inaccessibleInstallations: string[];
};

// muster's MCP Servers route, where the sign-in pointer links to.
jest.mock('@backstage/frontend-plugin-api', () => ({
  ...jest.requireActual('@backstage/frontend-plugin-api'),
  useRouteRef: () => () => '/customize/connectors',
}));

jest.mock('../NewAgentFormProvider', () => ({
  useNewAgentForm: () => ({
    state: mockState,
    setInstallation: mockSetInstallation,
  }),
}));

jest.mock('@giantswarm/backstage-plugin-gs', () => ({
  useInstallations: () => ({
    installations: mockInstallations,
    isLoading: mockIsLoadingInstallations,
  }),
}));

jest.mock('../ModelConfigsProvider', () => ({
  useModelConfigs: () => mockModelConfigs,
}));

type Presence = 'available' | 'missing' | 'unknown' | 'sharedIdentity';
let mockPresence: Record<string, Presence>;
let mockAgentManagerLoading: boolean;
let mockMusterPluginMissing: boolean;
const mockRecheck = jest.fn(() => Promise.resolve());

// Feature detection: which installations' musters list agent-manager. Driven per
// case; the hook itself is covered with the muster API in useAgentManager's tests.
jest.mock('../../hooks/useAgentManager', () => ({
  useAgentManagerAvailability: (installations: string[]) => ({
    available: installations.filter(name => mockPresence[name] === 'available'),
    missing: installations.filter(name => mockPresence[name] === 'missing'),
    sharedIdentity: installations.filter(
      name => mockPresence[name] === 'sharedIdentity',
    ),
    presenceOf: (name: string) => mockPresence[name] ?? 'unknown',
    isLoading: mockAgentManagerLoading,
    isUnavailable: mockMusterPluginMissing,
    recheck: mockRecheck,
  }),
}));

describe('InstallationSelect', () => {
  beforeEach(() => {
    mockSetInstallation.mockClear();
    mockRecheck.mockClear();
    mockState = { installation: undefined };
    mockInstallations = [{ name: 'alpha' }, { name: 'beta' }];
    mockIsLoadingInstallations = false;
    mockModelConfigs = {
      isLoading: false,
      hasInstallations: true,
      availableInstallations: ['alpha', 'beta'],
      unreachableInstallations: [],
      inaccessibleInstallations: [],
    };
    mockPresence = { alpha: 'available', beta: 'available', solo: 'available' };
    mockAgentManagerLoading = false;
    mockMusterPluginMissing = false;
  });

  describe('agent-manager gating', () => {
    it('offers only the installations whose muster lists agent-manager, and says why the others are missing', () => {
      mockPresence = { alpha: 'available', beta: 'missing' };

      const { getByText, queryByText } = render(<InstallationSelect />);

      expect(getByText('alpha')).toBeInTheDocument();
      expect(queryByText('beta')).not.toBeInTheDocument();
      expect(getByText('No agent-manager on beta')).toBeInTheDocument();
      expect(
        getByText(/muster on beta lists no agent-manager,/),
      ).toBeInTheDocument();
    });

    it('offers no installation whose muster runs under its shared identity, and says why', () => {
      mockPresence = { alpha: 'available', beta: 'sharedIdentity' };

      const { getByText, queryByText } = render(<InstallationSelect />);

      expect(getByText('alpha')).toBeInTheDocument();
      expect(queryByText('beta')).not.toBeInTheDocument();
      expect(
        getByText('Agents cannot be created on beta from this portal'),
      ).toBeInTheDocument();
      expect(
        getByText(/muster on beta has no per-user sign-in in this portal/),
      ).toBeInTheDocument();
    });

    it('withdraws a pick whose muster turns out to run under its shared identity', () => {
      mockInstallations = [
        { name: 'alpha' },
        { name: 'beta' },
        { name: 'gamma' },
      ];
      mockModelConfigs = {
        ...mockModelConfigs,
        availableInstallations: ['alpha', 'beta', 'gamma'],
      };
      mockState = { installation: 'beta' };
      mockPresence = {
        alpha: 'available',
        beta: 'sharedIdentity',
        gamma: 'available',
      };

      render(<InstallationSelect />);

      expect(mockSetInstallation).toHaveBeenCalledWith(undefined);
    });

    it('withdraws a pick whose muster turns out to lack agent-manager', () => {
      mockInstallations = [
        { name: 'alpha' },
        { name: 'beta' },
        { name: 'gamma' },
      ];
      mockModelConfigs = {
        ...mockModelConfigs,
        availableInstallations: ['alpha', 'beta', 'gamma'],
      };
      mockState = { installation: 'beta' };
      mockPresence = {
        alpha: 'available',
        beta: 'missing',
        gamma: 'available',
      };

      render(<InstallationSelect />);

      expect(mockSetInstallation).toHaveBeenCalledWith(undefined);
    });

    it('swaps a pick lacking agent-manager for the only usable installation', () => {
      mockState = { installation: 'beta' };
      mockPresence = { alpha: 'available', beta: 'missing' };

      const { getByText } = render(<InstallationSelect />);

      expect(mockSetInstallation).toHaveBeenCalledWith('alpha');
      expect(mockSetInstallation).not.toHaveBeenCalledWith(undefined);
      // The card stays: it is what explains why beta is not offered.
      expect(getByText('No agent-manager on beta')).toBeInTheDocument();
    });

    it('keeps the picker settling while the server lists are still being read', () => {
      mockPresence = {};
      mockAgentManagerLoading = true;

      const { getByText } = render(<InstallationSelect />);

      expect(
        getByText('Finding environments with models and agent-manager…'),
      ).toBeInTheDocument();
    });

    it('explains that nothing can be created when no installation has agent-manager', () => {
      mockPresence = { alpha: 'missing', beta: 'missing' };

      const { getByText, queryByText } = render(<InstallationSelect />);

      expect(
        getByText('No agent-manager on some environments'),
      ).toBeInTheDocument();
      expect(
        queryByText('No environments with models'),
      ).not.toBeInTheDocument();
    });

    it('requires the muster plugin — there is no other path to agent-manager', () => {
      mockMusterPluginMissing = true;

      const { getByText, queryByLabelText } = render(<InstallationSelect />);

      expect(getByText('The muster plugin is required')).toBeInTheDocument();
      expect(queryByLabelText('Environment')).not.toBeInTheDocument();
    });

    it('never picks the sole installation when its muster runs under its shared identity', () => {
      mockInstallations = [{ name: 'solo' }];
      mockModelConfigs = {
        ...mockModelConfigs,
        availableInstallations: ['solo'],
      };
      mockState = { installation: 'solo' };
      mockPresence = { solo: 'sharedIdentity' };

      const { getByText } = render(<InstallationSelect />);

      expect(mockSetInstallation).not.toHaveBeenCalledWith('solo');
      expect(mockSetInstallation).toHaveBeenCalledWith(undefined);
      expect(
        getByText('Agents cannot be created on solo from this portal'),
      ).toBeInTheDocument();
    });

    it('does not hide the sole installation when its muster lacks agent-manager', () => {
      mockInstallations = [{ name: 'solo' }];
      mockModelConfigs = {
        ...mockModelConfigs,
        availableInstallations: ['solo'],
      };
      mockPresence = { solo: 'missing' };

      const { getByText } = render(<InstallationSelect />);

      expect(getByText('No agent-manager on solo')).toBeInTheDocument();
    });
  });

  describe('with more than one installation configured', () => {
    it('renders the picker', () => {
      const { getByRole, getByText } = render(<InstallationSelect />);

      expect(
        getByRole('heading', { name: 'Environment', level: 3 }),
      ).toBeInTheDocument();
      expect(getByText('alpha')).toBeInTheDocument();
      expect(getByText('beta')).toBeInTheDocument();
      expect(mockSetInstallation).not.toHaveBeenCalled();
    });

    it('marks the dropdown with the form’s validation problem', () => {
      const { getByRole, getByText } = render(
        <InstallationSelect error="Select an environment" />,
      );

      const trigger = getByRole('button', { name: /Environment/ });
      const message = getByText('Select an environment');
      expect(trigger.getAttribute('aria-describedby')).toContain(message.id);
      expect(trigger.closest('[data-invalid]')).not.toBeNull();
    });

    it('names the field for assistive tech without repeating the card heading', () => {
      const { getAllByText, getByLabelText } = render(<InstallationSelect />);

      // The section heading is the only visible "Environment" text; the select
      // carries the same name via aria-label instead of a second visible label.
      expect(getAllByText('Environment')).toHaveLength(1);
      expect(getByLabelText('Environment')).toBeInTheDocument();
    });

    it('shows the loading state while models are still resolving across the fleet', () => {
      mockModelConfigs = {
        ...mockModelConfigs,
        isLoading: true,
        availableInstallations: [],
      };

      const { getByText } = render(<InstallationSelect />);

      expect(
        getByText('Finding environments with models and agent-manager…'),
      ).toBeInTheDocument();
    });

    it('flags that the list is still growing once some installations have responded', () => {
      mockModelConfigs = {
        ...mockModelConfigs,
        isLoading: true,
        availableInstallations: ['alpha'],
      };

      const { getByText } = render(<InstallationSelect />);

      expect(
        getByText('Still checking the remaining environments…'),
      ).toBeInTheDocument();
    });

    it('surfaces the empty state when no reachable installation has a model', () => {
      mockModelConfigs = {
        ...mockModelConfigs,
        availableInstallations: [],
      };

      const { getByText } = render(<InstallationSelect />);

      expect(getByText('No environments with models')).toBeInTheDocument();
    });
  });

  describe('with several configured but only one offering models', () => {
    beforeEach(() => {
      mockModelConfigs = {
        ...mockModelConfigs,
        availableInstallations: ['alpha'],
      };
    });

    it('says where the agent runs instead of offering a one-option dropdown once the fleet query settles', () => {
      const { getByRole, getByText, queryByLabelText } = render(
        <InstallationSelect />,
      );

      // The card stays: it was on screen while the fleet resolved.
      expect(
        getByRole('heading', { name: 'Environment', level: 3 }),
      ).toBeInTheDocument();
      expect(
        getByText(/the only environment with models and agent-manager/),
      ).toHaveTextContent(
        'Runs on alpha, the only environment with models and agent-manager.',
      );
      expect(queryByLabelText('Environment')).not.toBeInTheDocument();
      expect(mockSetInstallation).toHaveBeenCalledWith('alpha');
    });

    it('keeps offering the picker while other installations may still respond', () => {
      mockModelConfigs = { ...mockModelConfigs, isLoading: true };

      const { getByLabelText, queryByText } = render(<InstallationSelect />);

      expect(getByLabelText('Environment')).toBeInTheDocument();
      expect(queryByText(/^Runs on/)).not.toBeInTheDocument();
      expect(mockSetInstallation).not.toHaveBeenCalled();
    });

    it('keeps the sole option once settled, even when the fleet query re-probes', () => {
      const { getByText, queryByLabelText, rerender } = render(
        <InstallationSelect />,
      );
      // A cluster-access reconnect turns the inventory's probing back on.
      mockModelConfigs = { ...mockModelConfigs, isLoading: true };
      rerender(<InstallationSelect />);

      expect(getByText(/^Runs on/)).toBeInTheDocument();
      expect(queryByLabelText('Environment')).not.toBeInTheDocument();
    });

    it('keeps explaining unreachable installations', () => {
      mockModelConfigs = {
        ...mockModelConfigs,
        unreachableInstallations: ['beta'],
      };

      const { getByText } = render(<InstallationSelect />);

      expect(getByText(/^Runs on/)).toBeInTheDocument();
      expect(getByText(/Could not read 1 environment/)).toBeInTheDocument();
      expect(mockSetInstallation).toHaveBeenCalledWith('alpha');
    });

    it('explains installations whose cluster access is not healthy', () => {
      mockModelConfigs = {
        ...mockModelConfigs,
        inaccessibleInstallations: ['gamma'],
      };

      const { getByText } = render(<InstallationSelect />);

      expect(getByText('Could not check gamma')).toBeInTheDocument();
      expect(getByText(/Cluster access to gamma is not healthy/)).toBeVisible();
    });
  });

  describe('with several configured but only one known to have agent-manager', () => {
    it('keeps the picker and explains an installation whose server list could not be read', () => {
      mockPresence = { alpha: 'available', beta: 'unknown' };

      const { getByLabelText, getByRole, getByText, queryByText } = render(
        <InstallationSelect />,
      );

      // beta might have agent-manager, so alpha is not the only choice yet.
      expect(getByLabelText('Environment')).toBeInTheDocument();
      expect(queryByText(/^Runs on/)).not.toBeInTheDocument();
      expect(queryByText('beta')).not.toBeInTheDocument();
      expect(
        getByText('Could not check beta for agent-manager'),
      ).toBeInTheDocument();
      // What it means for the agent being created.
      expect(
        getByText(/beta is not offered for this agent until it is checked/),
      ).toBeInTheDocument();
      expect(
        getByText(/Sign in to muster on beta to check whether agents/),
      ).toBeInTheDocument();
      // Points at where that sign-in happens: muster, scoped to beta, in a
      // new tab, so the form stays as it is (and says so).
      const link = getByRole('link', {
        name: 'Sign in to muster (opens in a new tab)',
      });
      expect(link).toHaveAttribute(
        'href',
        '/customize/connectors?installation=beta',
      );
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      expect(mockSetInstallation).not.toHaveBeenCalled();
    });

    it('reads the server lists again on Check again, once signed in elsewhere', async () => {
      mockPresence = { alpha: 'available', beta: 'unknown' };

      render(<InstallationSelect />);
      await userEvent.click(
        screen.getByRole('button', { name: 'Check again' }),
      );

      expect(mockRecheck).toHaveBeenCalledTimes(1);
    });

    it('keeps the picker while the server lists are still being read', () => {
      mockPresence = { alpha: 'available', beta: 'missing' };
      mockAgentManagerLoading = true;

      const { getByLabelText, getByText } = render(<InstallationSelect />);

      expect(getByLabelText('Environment')).toBeInTheDocument();
      expect(
        getByText('Still checking the remaining environments…'),
      ).toBeInTheDocument();
      expect(mockSetInstallation).not.toHaveBeenCalled();
    });
  });

  describe('at fleet scale: installations whose server list could not be read', () => {
    /** `alpha` usable, then `count` installations whose muster could not be read. */
    const unknownFleet = (count: number) => {
      const names = Array.from(
        { length: count },
        (_, i) => `inst-${String(i).padStart(2, '0')}`,
      );
      mockPresence = {
        alpha: 'available',
        ...Object.fromEntries(names.map(name => [name, 'unknown' as const])),
      };
      mockModelConfigs = {
        ...mockModelConfigs,
        availableInstallations: ['alpha', ...names],
      };
      return names;
    };

    it('links every one of three, with no reveal control', () => {
      unknownFleet(3);

      const { getAllByRole, queryByRole, getByText } = render(
        <InstallationSelect />,
      );

      expect(
        getAllByRole('link', { name: /^Sign in to muster on/ }),
      ).toHaveLength(3);
      expect(queryByRole('button', { name: /^Show/ })).toBeNull();
      expect(queryByRole('searchbox')).toBeNull();
      expect(
        getByText(
          /Sign in to muster on inst-00, inst-01, inst-02 to check whether/,
        ),
      ).toBeInTheDocument();
    });

    it('links the first five of 50, wrapping, and reveals the rest in one click', async () => {
      unknownFleet(50);

      const { getAllByRole, getByRole, getByText } = render(
        <InstallationSelect />,
      );

      const links = getAllByRole('link', { name: /^Sign in to muster on/ });
      expect(links).toHaveLength(5);
      expect(links[0].parentElement).toHaveStyle({ flexWrap: 'wrap' });
      expect(
        getByText(
          /Sign in to muster on inst-00, inst-01, inst-02, inst-03, inst-04 and 45 more to check/,
        ),
      ).toBeInTheDocument();

      await userEvent.click(
        getByRole('button', { name: 'Show all 50 environments' }),
      );

      expect(
        getAllByRole('link', { name: /^Sign in to muster on/ }),
      ).toHaveLength(50);
    });

    it('names the first five installations whose cluster access is not healthy', () => {
      mockModelConfigs = {
        ...mockModelConfigs,
        inaccessibleInstallations: Array.from(
          { length: 50 },
          (_, i) => `gone-${String(i).padStart(2, '0')}`,
        ),
      };

      const { getByText } = render(<InstallationSelect />);

      expect(getByText('Could not check 50 environments')).toBeInTheDocument();
      expect(
        getByText(
          /^Cluster access to gone-00, gone-01, gone-02, gone-03, gone-04 and 45 more is not healthy/,
        ),
      ).toBeVisible();
    });
  });

  describe('with a single installation configured', () => {
    beforeEach(() => {
      mockInstallations = [{ name: 'solo' }];
      mockModelConfigs = {
        ...mockModelConfigs,
        availableInstallations: ['solo'],
      };
    });

    it('hides the picker and auto-selects it', () => {
      const { container } = render(<InstallationSelect />);

      expect(container).toBeEmptyDOMElement();
      expect(mockSetInstallation).toHaveBeenCalledTimes(1);
      expect(mockSetInstallation).toHaveBeenCalledWith('solo');
    });

    it('does not re-select once it is already selected', () => {
      mockState = { installation: 'solo' };

      render(<InstallationSelect />);

      expect(mockSetInstallation).not.toHaveBeenCalled();
    });

    it('renders nothing while the fleet query is still settling', () => {
      // Rendering the loading card here would make it appear only to vanish
      // once the sole installation turns out to be usable.
      mockModelConfigs = {
        ...mockModelConfigs,
        isLoading: true,
        availableInstallations: [],
      };

      const { container } = render(<InstallationSelect />);

      expect(container).toBeEmptyDOMElement();
    });

    it('still explains itself when the sole installation has no models', () => {
      mockModelConfigs = {
        ...mockModelConfigs,
        availableInstallations: [],
      };

      const { getByText } = render(<InstallationSelect />);

      // Hiding the card here would leave the model picker's "no ModelConfigs on
      // X" fallback as the only feedback, which misdiagnoses the problem.
      expect(getByText('No environments with models')).toBeInTheDocument();
      expect(mockSetInstallation).toHaveBeenCalledWith('solo');
    });

    it('still explains itself when the sole installation is unreachable', () => {
      mockModelConfigs = {
        ...mockModelConfigs,
        availableInstallations: [],
        unreachableInstallations: ['solo'],
      };

      const { getByText, queryByText } = render(<InstallationSelect />);

      expect(getByText(/Could not read 1 environment/)).toBeInTheDocument();
      // Don't claim "no models" when the read never succeeded.
      expect(queryByText('No environments with models')).toBeNull();
    });

    it("still explains itself when the sole installation's server list could not be read", () => {
      mockPresence = { solo: 'unknown' };

      const { getByText, queryByText } = render(<InstallationSelect />);

      expect(
        getByText('Could not check solo for agent-manager'),
      ).toBeInTheDocument();
      expect(queryByText('No environments with models')).toBeNull();
    });

    it('still explains itself when cluster access to the sole installation is not healthy', () => {
      mockModelConfigs = {
        ...mockModelConfigs,
        availableInstallations: [],
        inaccessibleInstallations: ['solo'],
      };

      const { getByText, queryByText } = render(<InstallationSelect />);

      expect(getByText('Could not check solo')).toBeInTheDocument();
      expect(queryByText('No environments with models')).toBeNull();
    });
  });

  describe('the environment select at scale', () => {
    const offer = (names: string[]) => {
      mockInstallations = names.map(name => ({ name }));
      mockModelConfigs = {
        ...mockModelConfigs,
        availableInstallations: names,
      };
      mockPresence = Object.fromEntries(
        names.map(name => [name, 'available' as const]),
      );
    };

    it('offers three environments without a search', async () => {
      offer(['alpha', 'beta', 'gamma']);
      render(<InstallationSelect />);

      await userEvent.click(
        screen.getByRole('button', { name: /Environment/ }),
      );
      expect(
        await screen.findByRole('option', { name: 'gamma' }),
      ).toBeInTheDocument();
      expect(screen.queryByRole('searchbox')).toBeNull();
    });

    it('offers type-ahead over 300 environments', async () => {
      offer(
        Array.from(
          { length: 300 },
          (_, i) => `inst-${String(i).padStart(3, '0')}`,
        ),
      );
      render(<InstallationSelect />);

      await userEvent.click(
        screen.getByRole('button', { name: /Environment/ }),
      );
      expect(await screen.findByRole('searchbox')).toBeInTheDocument();
    });
  });

  it('holds the read warning until an environment is offered or the fleet settles', () => {
    // gamma failed already; alpha and beta are still being read.
    mockModelConfigs = {
      ...mockModelConfigs,
      isLoading: true,
      availableInstallations: [],
      unreachableInstallations: ['gamma'],
    };
    const { rerender } = render(<InstallationSelect />);
    expect(
      screen.getByText(/Finding environments with models/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Could not read/)).not.toBeInTheDocument();

    // alpha is offered while beta is still being read: the warning joins it,
    // as on a list showing its first rows.
    mockModelConfigs = {
      ...mockModelConfigs,
      availableInstallations: ['alpha'],
    };
    mockPresence = { alpha: 'available' };
    rerender(<InstallationSelect />);
    expect(
      screen.getByText(/Still checking the remaining/),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Could not read 1 environment'),
    ).toBeInTheDocument();
  });

  it('renders nothing until the installations config resolves', () => {
    mockIsLoadingInstallations = true;
    mockInstallations = [];
    mockModelConfigs = {
      isLoading: true,
      hasInstallations: false,
      availableInstallations: [],
      unreachableInstallations: [],
      inaccessibleInstallations: [],
    };

    const { container } = render(<InstallationSelect />);

    expect(container).toBeEmptyDOMElement();
    expect(mockSetInstallation).not.toHaveBeenCalled();
  });
});
