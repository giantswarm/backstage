import { render } from '@testing-library/react';
import { InstallationSelect } from './InstallationSelect';

type FormState = { installation: string | undefined };

let mockState: FormState;
const mockSetInstallation = jest.fn();

let mockInstallations: { name: string }[];

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
    isLoading: false,
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
    mockModelConfigs = {
      isLoading: false,
      hasInstallations: true,
      availableInstallations: ['alpha', 'beta'],
      unreachableInstallations: [],
    };
  });

  it('renders the picker when more than one installation is configured', () => {
    const { getAllByText, getByText } = render(<InstallationSelect />);

    expect(getAllByText('Installation').length).toBeGreaterThan(0);
    expect(getByText('alpha')).toBeInTheDocument();
    expect(getByText('beta')).toBeInTheDocument();
    expect(mockSetInstallation).not.toHaveBeenCalled();
  });

  it('hides the picker and auto-selects the sole installation when only one is configured', () => {
    mockInstallations = [{ name: 'solo' }];
    mockModelConfigs = {
      ...mockModelConfigs,
      availableInstallations: ['solo'],
    };

    const { container } = render(<InstallationSelect />);

    expect(container).toBeEmptyDOMElement();
    expect(mockSetInstallation).toHaveBeenCalledTimes(1);
    expect(mockSetInstallation).toHaveBeenCalledWith('solo');
  });

  it('does not re-select once the sole installation is already selected', () => {
    mockInstallations = [{ name: 'solo' }];
    mockState = { installation: 'solo' };
    mockModelConfigs = {
      ...mockModelConfigs,
      availableInstallations: ['solo'],
    };

    render(<InstallationSelect />);

    expect(mockSetInstallation).not.toHaveBeenCalled();
  });

  it('still shows the loading state while models are still resolving across the fleet', () => {
    mockModelConfigs = {
      isLoading: true,
      hasInstallations: true,
      availableInstallations: [],
      unreachableInstallations: [],
    };

    const { getByText } = render(<InstallationSelect />);

    expect(getByText('Finding installations with models…')).toBeInTheDocument();
  });

  it('surfaces the empty state when no reachable installation has a model', () => {
    mockModelConfigs = {
      isLoading: false,
      hasInstallations: true,
      availableInstallations: [],
      unreachableInstallations: [],
    };

    const { getByText } = render(<InstallationSelect />);

    expect(getByText('No installations with models')).toBeInTheDocument();
  });
});
