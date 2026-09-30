import { render } from '@testing-library/react';
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

// The muster Tool Explorer route the sign-in pointer links to.
jest.mock('@backstage/frontend-plugin-api', () => ({
  ...jest.requireActual('@backstage/frontend-plugin-api'),
  useRouteRef: () => () => '/agent-platform/muster/tools',
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

type Presence = 'available' | 'missing' | 'unknown';
let mockPresence: Record<string, Presence>;
let mockAgentManagerLoading: boolean;
let mockMusterPluginMissing: boolean;

// Feature detection: which installations' musters list agent-manager. Driven per
// case; the hook itself is covered with the muster API in useAgentManager's tests.
jest.mock('../../hooks/useAgentManager', () => ({
  useAgentManagerAvailability: (installations: string[]) => ({
    available: installations.filter(name => mockPresence[name] === 'available'),
    missing: installations.filter(name => mockPresence[name] === 'missing'),
    presenceOf: (name: string) => mockPresence[name] ?? 'unknown',
    isLoading: mockAgentManagerLoading,
    isUnavailable: mockMusterPluginMissing,
  }),
}));

describe('InstallationSelect', () => {
  beforeEach(() => {
    mockSetInstallation.mockClear();
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
        getByText(/muster on beta lists no agent-manager MCPServer/),
      ).toBeInTheDocument();
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
        getByText('Finding installations with models and agent-manager…'),
      ).toBeInTheDocument();
    });

    it('explains that nothing can be created when no installation has agent-manager', () => {
      mockPresence = { alpha: 'missing', beta: 'missing' };

      const { getByText, queryByText } = render(<InstallationSelect />);

      expect(
        getByText('No agent-manager on some installations'),
      ).toBeInTheDocument();
      expect(
        queryByText('No installations with models'),
      ).not.toBeInTheDocument();
    });

    it('requires the muster plugin — there is no other path to agent-manager', () => {
      mockMusterPluginMissing = true;

      const { getByText, queryByLabelText } = render(<InstallationSelect />);

      expect(getByText('The muster plugin is required')).toBeInTheDocument();
      expect(queryByLabelText('Installation')).not.toBeInTheDocument();
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
        getByRole('heading', { name: 'Installation', level: 3 }),
      ).toBeInTheDocument();
      expect(getByText('alpha')).toBeInTheDocument();
      expect(getByText('beta')).toBeInTheDocument();
      expect(mockSetInstallation).not.toHaveBeenCalled();
    });

    it('names the field for assistive tech without repeating the card heading', () => {
      const { getAllByText, getByLabelText } = render(<InstallationSelect />);

      // The section heading is the only visible "Installation" text; the select
      // carries the same name via aria-label instead of a second visible label.
      expect(getAllByText('Installation')).toHaveLength(1);
      expect(getByLabelText('Installation')).toBeInTheDocument();
    });

    it('shows the loading state while models are still resolving across the fleet', () => {
      mockModelConfigs = {
        ...mockModelConfigs,
        isLoading: true,
        availableInstallations: [],
      };

      const { getByText } = render(<InstallationSelect />);

      expect(
        getByText('Finding installations with models and agent-manager…'),
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
        getByText('Still checking the remaining installations…'),
      ).toBeInTheDocument();
    });

    it('surfaces the empty state when no reachable installation has a model', () => {
      mockModelConfigs = {
        ...mockModelConfigs,
        availableInstallations: [],
      };

      const { getByText } = render(<InstallationSelect />);

      expect(getByText('No installations with models')).toBeInTheDocument();
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
        getByRole('heading', { name: 'Installation', level: 3 }),
      ).toBeInTheDocument();
      expect(
        getByText(/the only installation with models and agent-manager/),
      ).toHaveTextContent(
        'Runs on alpha, the only installation with models and agent-manager.',
      );
      expect(queryByLabelText('Installation')).not.toBeInTheDocument();
      expect(mockSetInstallation).toHaveBeenCalledWith('alpha');
    });

    it('keeps offering the picker while other installations may still respond', () => {
      mockModelConfigs = { ...mockModelConfigs, isLoading: true };

      const { getByLabelText, queryByText } = render(<InstallationSelect />);

      expect(getByLabelText('Installation')).toBeInTheDocument();
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
      expect(queryByLabelText('Installation')).not.toBeInTheDocument();
    });

    it('keeps explaining unreachable installations', () => {
      mockModelConfigs = {
        ...mockModelConfigs,
        unreachableInstallations: ['beta'],
      };

      const { getByText } = render(<InstallationSelect />);

      expect(getByText(/^Runs on/)).toBeInTheDocument();
      expect(getByText(/Couldn't read 1 installation/)).toBeInTheDocument();
      expect(mockSetInstallation).toHaveBeenCalledWith('alpha');
    });

    it('explains installations whose cluster access is not healthy', () => {
      mockModelConfigs = {
        ...mockModelConfigs,
        inaccessibleInstallations: ['gamma'],
      };

      const { getByText } = render(<InstallationSelect />);

      expect(getByText("Couldn't check gamma")).toBeInTheDocument();
      expect(getByText(/Cluster access to gamma isn't healthy/)).toBeVisible();
    });
  });

  describe('with several configured but only one known to have agent-manager', () => {
    it('keeps the picker and explains an installation whose server list could not be read', () => {
      mockPresence = { alpha: 'available', beta: 'unknown' };

      const { getByLabelText, getByRole, getByText, queryByText } = render(
        <InstallationSelect />,
      );

      // beta might have agent-manager, so alpha is not the only choice yet.
      expect(getByLabelText('Installation')).toBeInTheDocument();
      expect(queryByText(/^Runs on/)).not.toBeInTheDocument();
      expect(queryByText('beta')).not.toBeInTheDocument();
      expect(
        getByText("Couldn't check beta for agent-manager"),
      ).toBeInTheDocument();
      expect(
        getByText(/Sign in to muster on beta to check whether agents/),
      ).toBeInTheDocument();
      // Points at where that sign-in happens: muster, scoped to beta.
      expect(getByRole('link', { name: 'Sign in to muster' })).toHaveAttribute(
        'href',
        '/agent-platform/muster/tools?installation=beta',
      );
      expect(mockSetInstallation).not.toHaveBeenCalled();
    });

    it('keeps the picker while the server lists are still being read', () => {
      mockPresence = { alpha: 'available', beta: 'missing' };
      mockAgentManagerLoading = true;

      const { getByLabelText, getByText } = render(<InstallationSelect />);

      expect(getByLabelText('Installation')).toBeInTheDocument();
      expect(
        getByText('Still checking the remaining installations…'),
      ).toBeInTheDocument();
      expect(mockSetInstallation).not.toHaveBeenCalled();
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
      expect(getByText('No installations with models')).toBeInTheDocument();
      expect(mockSetInstallation).toHaveBeenCalledWith('solo');
    });

    it('still explains itself when the sole installation is unreachable', () => {
      mockModelConfigs = {
        ...mockModelConfigs,
        availableInstallations: [],
        unreachableInstallations: ['solo'],
      };

      const { getByText, queryByText } = render(<InstallationSelect />);

      expect(getByText(/Couldn't read 1 installation/)).toBeInTheDocument();
      // Don't claim "no models" when the read never succeeded.
      expect(queryByText('No installations with models')).toBeNull();
    });

    it("still explains itself when the sole installation's server list could not be read", () => {
      mockPresence = { solo: 'unknown' };

      const { getByText, queryByText } = render(<InstallationSelect />);

      expect(
        getByText("Couldn't check solo for agent-manager"),
      ).toBeInTheDocument();
      expect(queryByText('No installations with models')).toBeNull();
    });

    it('still explains itself when cluster access to the sole installation is not healthy', () => {
      mockModelConfigs = {
        ...mockModelConfigs,
        availableInstallations: [],
        inaccessibleInstallations: ['solo'],
      };

      const { getByText, queryByText } = render(<InstallationSelect />);

      expect(getByText("Couldn't check solo")).toBeInTheDocument();
      expect(queryByText('No installations with models')).toBeNull();
    });
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
