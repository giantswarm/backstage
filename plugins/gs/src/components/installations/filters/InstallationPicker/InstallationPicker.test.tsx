import { waitFor } from '@testing-library/react';
import {
  renderInTestApp,
  TestApiProvider,
} from '@backstage/frontend-test-utils';
import { mutedInstallationsApiRef } from '../../../../apis/mutedInstallations';
import { MutedInstallationsStore } from '../../../../apis/mutedInstallations/MutedInstallationsStore';
import { InstallationPicker } from './InstallationPicker';

// Capture the props MultipleClustersSelector receives so we can assert the
// disabledClusters union without rendering its heavy internals.
const mockSelector = jest.fn();
jest.mock('@giantswarm/backstage-plugin-kubernetes-react', () => ({
  MultipleClustersSelector: (props: unknown) => {
    mockSelector(props);
    return null;
  },
  useClustersInfo: () => ({
    clusters: ['alpha', 'beta', 'gamma'],
    isLoading: false,
  }),
}));

// Health-based disabled installations (distinct from user-muted).
jest.mock('../../../hooks', () => ({
  useDisabledInstallations: () => ({
    disabledInstallations: ['beta'],
    isLoading: false,
  }),
}));

describe('InstallationPicker', () => {
  beforeEach(() => {
    mockSelector.mockClear();
    window.localStorage.clear();
  });

  it('unions user-muted installations into disabledClusters', async () => {
    const mutedStore = MutedInstallationsStore.create();
    mutedStore.setMuted('gamma', true);

    await renderInTestApp(
      <TestApiProvider apis={[[mutedInstallationsApiRef, mutedStore]]}>
        <InstallationPicker onActiveInstallationsChange={() => {}} />
      </TestApiProvider>,
    );

    await waitFor(() => {
      const props = mockSelector.mock.calls.at(-1)?.[0];
      // beta (health-disabled) ∪ gamma (user-muted).
      expect([...props.disabledClusters].sort()).toEqual(['beta', 'gamma']);
    });
  });
});
