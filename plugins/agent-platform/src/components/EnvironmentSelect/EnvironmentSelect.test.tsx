import { render } from '@testing-library/react';
import { EnvironmentSelect } from './EnvironmentSelect';

type Entry = { installation: string };

type ScopeSelectProps = {
  label?: string;
  component?: string;
  describe?: (entry: Entry) => string | undefined;
  searchable?: boolean;
};

let mockScopeSelectProps: ScopeSelectProps | undefined;
const mockScope = { isSingleInstallation: false, isLoading: false };
jest.mock('@giantswarm/backstage-plugin-gs', () => ({
  InstallationScopeSelect: (props: ScopeSelectProps) => {
    mockScopeSelectProps = props;
    return <div data-testid="scope-select">{props.label}</div>;
  },
  useInstallationScope: () => mockScope,
}));

const mockUseKagentInstallations = jest.fn(() => ({
  isNotReachable: (installation: string) => installation === 'golem',
}));
jest.mock('../../hooks/useKagentInstallations', () => ({
  useKagentInstallations: () => mockUseKagentInstallations(),
}));

const mockUseMusterInstallations = jest.fn(() => ({
  isNotReachable: (installation: string) => installation === 'grizzly',
}));
jest.mock('@giantswarm/backstage-plugin-muster', () => ({
  useMusterInstallations: () => mockUseMusterInstallations(),
}));

const entry = (installation: string): Entry => ({ installation });

describe('EnvironmentSelect', () => {
  beforeEach(() => {
    mockScopeSelectProps = undefined;
    mockScope.isSingleInstallation = false;
    mockScope.isLoading = false;
    mockUseKagentInstallations.mockClear();
    mockUseMusterInstallations.mockClear();
  });

  it('is the installation scope under the name Environment', () => {
    const { getByTestId } = render(<EnvironmentSelect component="kagent" />);

    expect(getByTestId('scope-select')).toHaveTextContent('Environment');
    expect(mockScopeSelectProps?.component).toBe('kagent');
    // The agent platform opts into type-ahead at scale; gs's default is off.
    expect(mockScopeSelectProps?.searchable).toBe(true);
  });

  it('marks the installations whose kagent the portal cannot reach on a kagent view', () => {
    render(<EnvironmentSelect component="kagent" />);

    expect(mockScopeSelectProps?.describe?.(entry('golem'))).toBe(
      'not reachable from this portal',
    );
    expect(mockScopeSelectProps?.describe?.(entry('grizzly'))).toBeUndefined();
    expect(mockScopeSelectProps?.describe?.(entry('gazelle'))).toBeUndefined();
  });

  it('marks the installations whose muster the portal cannot reach on a muster view', () => {
    render(<EnvironmentSelect component="muster" />);

    expect(mockScopeSelectProps?.describe?.(entry('grizzly'))).toBe(
      'not reachable from this portal',
    );
    expect(mockScopeSelectProps?.describe?.(entry('golem'))).toBeUndefined();
  });

  it('marks nothing on a view that reads no component, and asks neither backend', () => {
    render(<EnvironmentSelect />);

    expect(mockScopeSelectProps?.component).toBeUndefined();
    expect(mockScopeSelectProps?.describe).toBeUndefined();
    expect(mockUseKagentInstallations).not.toHaveBeenCalled();
    expect(mockUseMusterInstallations).not.toHaveBeenCalled();
  });

  it('asks only the backend of the component the view reads', () => {
    render(<EnvironmentSelect component="kagent" />);
    expect(mockUseKagentInstallations).toHaveBeenCalled();
    expect(mockUseMusterInstallations).not.toHaveBeenCalled();
  });

  it.each([
    ['on a single-installation portal', { isSingleInstallation: true }],
    ['while the installations are read', { isLoading: true }],
  ])('renders nothing, not even its slot, %s', (_case, state) => {
    Object.assign(mockScope, state);
    const { container } = render(<EnvironmentSelect component="kagent" />);

    expect(container).toBeEmptyDOMElement();
    expect(mockUseKagentInstallations).not.toHaveBeenCalled();
  });
});
