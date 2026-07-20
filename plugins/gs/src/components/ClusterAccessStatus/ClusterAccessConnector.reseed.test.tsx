import { act, waitFor } from '@testing-library/react';
import {
  renderInTestApp,
  TestApiProvider,
} from '@backstage/frontend-test-utils';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { gsAuthProvidersApiRef } from '../../apis/auth';
import {
  clusterAccessStatusApiRef,
  ClusterAccessStatusStore,
} from '../../apis/clusterAccessStatus';
import {
  mutedInstallationsApiRef,
  MutedInstallationsStore,
} from '../../apis/mutedInstallations';
import { ClusterAccessConnector } from './ClusterAccessConnector';

function fakeAuthProviders(broker: string[]) {
  return {
    getBrokerCoveredInstallations: () => broker,
    getKubernetesAuthApis: () => ({}),
    getProviders: () => [],
  } as any;
}

function stateByInstallation(store: ClusterAccessStatusStore) {
  return Object.fromEntries(
    store.getSnapshot().map(entry => [entry.installation, entry.state]),
  );
}

describe('ClusterAccessConnector', () => {
  beforeEach(() => window.localStorage.clear());

  it('does not reset already-healthy installations to connecting when another is muted', async () => {
    const statusApi =
      ClusterAccessStatusStore.create() as ClusterAccessStatusStore;
    const mutedApi = MutedInstallationsStore.create();
    const kubernetesApi = {
      proxy: jest.fn(async () => ({ ok: true, status: 200 })),
    } as any;

    await renderInTestApp(
      <TestApiProvider
        apis={[
          [kubernetesApiRef, kubernetesApi],
          [gsAuthProvidersApiRef, fakeAuthProviders(['alpha', 'beta'])],
          [clusterAccessStatusApiRef, statusApi],
          [mutedInstallationsApiRef, mutedApi],
        ]}
      >
        <ClusterAccessConnector />
      </TestApiProvider>,
    );

    // Both installations probe healthy.
    await waitFor(() =>
      expect(stateByInstallation(statusApi)).toEqual({
        alpha: 'healthy',
        beta: 'healthy',
      }),
    );

    // From here on, muting one installation must not re-seed the other back to
    // "connecting" (the reported grey-flicker regression).
    const recordConnecting = jest.spyOn(statusApi, 'recordConnecting');

    act(() => {
      mutedApi.setMuted('alpha', true);
    });

    // alpha drops off the status set; beta stays put and healthy.
    await waitFor(() =>
      expect(statusApi.getSnapshot().map(e => e.installation)).toEqual([
        'beta',
      ]),
    );
    expect(recordConnecting).not.toHaveBeenCalledWith('beta');
    expect(stateByInstallation(statusApi)).toEqual({ beta: 'healthy' });
  });
});
