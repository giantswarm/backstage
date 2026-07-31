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
};

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
    };
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
        getByText('Finding installations with models…'),
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
  });

  it('renders nothing until the installations config resolves', () => {
    mockIsLoadingInstallations = true;
    mockInstallations = [];
    mockModelConfigs = {
      isLoading: true,
      hasInstallations: false,
      availableInstallations: [],
      unreachableInstallations: [],
    };

    const { container } = render(<InstallationSelect />);

    expect(container).toBeEmptyDOMElement();
    expect(mockSetInstallation).not.toHaveBeenCalled();
  });
});
