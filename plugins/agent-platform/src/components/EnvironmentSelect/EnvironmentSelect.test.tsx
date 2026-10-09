import { render } from '@testing-library/react';
import { EnvironmentSelect } from './EnvironmentSelect';

type Entry = { installation: string };

type ScopeSelectProps = {
  label?: string;
  component?: string;
  describe?: (entry: Entry) => string | undefined;
};

let mockScopeSelectProps: ScopeSelectProps | undefined;
jest.mock('@giantswarm/backstage-plugin-gs', () => ({
  InstallationScopeSelect: (props: ScopeSelectProps) => {
    mockScopeSelectProps = props;
    return <div data-testid="scope-select">{props.label}</div>;
  },
}));

jest.mock('../../hooks/useKagentInstallations', () => ({
  useKagentInstallations: () => ({
    isNotReachable: (installation: string) => installation === 'golem',
  }),
}));

jest.mock('@giantswarm/backstage-plugin-muster', () => ({
  useMusterInstallations: () => ({
    isNotReachable: (installation: string) => installation === 'grizzly',
  }),
}));

const entry = (installation: string): Entry => ({ installation });

describe('EnvironmentSelect', () => {
  beforeEach(() => {
    mockScopeSelectProps = undefined;
  });

  it('is the installation scope under the name Environment', () => {
    const { getByTestId } = render(<EnvironmentSelect component="kagent" />);

    expect(getByTestId('scope-select')).toHaveTextContent('Environment');
    expect(mockScopeSelectProps?.component).toBe('kagent');
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

  it('marks nothing on a view that reads no component', () => {
    render(<EnvironmentSelect />);

    expect(mockScopeSelectProps?.component).toBeUndefined();
    expect(mockScopeSelectProps?.describe?.(entry('golem'))).toBeUndefined();
    expect(mockScopeSelectProps?.describe?.(entry('grizzly'))).toBeUndefined();
  });
});
