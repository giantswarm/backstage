import { ReactNode } from 'react';
import { TestApiProvider } from '@backstage/frontend-test-utils';
import {
  kubernetesApiRef,
  kubernetesAuthProvidersApiRef,
} from '@backstage/plugin-kubernetes-react';
import { renderHook, waitFor } from '@testing-library/react';
import { useCurrentUser } from './useCurrentUser';

jest.mock('@giantswarm/backstage-plugin-gs-react', () => ({
  useSignedInConfig: () => ({
    isLoading: false,
    config: {
      getOptionalStringArray: (key: string) =>
        key === 'gs.adminGroups' ? ['staff'] : undefined,
    },
  }),
}));

/** An unsigned JWT with the given claims. */
function tokenOf(claims: object): string {
  const part = (value: object) =>
    btoa(JSON.stringify(value)).replace(/=+$/, '');
  return `${part({ alg: 'none' })}.${part(claims)}.`;
}

function renderWithToken(token: string) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <TestApiProvider
      apis={[
        [
          kubernetesApiRef,
          {
            getCluster: async (name: string) => ({
              name,
              authProvider: 'serviceAccount',
            }),
          },
        ],
        [
          kubernetesAuthProvidersApiRef,
          { getCredentials: async () => ({ token }) },
        ],
      ]}
    >
      {children}
    </TestApiProvider>
  );
  return renderHook(() => useCurrentUser('meadow'), { wrapper });
}

describe('useCurrentUser', () => {
  it('counts a person in one of gs.adminGroups as staff', async () => {
    const { result } = renderWithToken(tokenOf({ groups: ['dev', 'staff'] }));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isGSUser).toBe(true);
  });

  it('counts a person in none of them as not staff', async () => {
    const { result } = renderWithToken(tokenOf({ groups: ['dev'] }));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isGSUser).toBe(false);
  });

  it('counts a token without a groups claim as not staff', async () => {
    const { result } = renderWithToken(tokenOf({ sub: 'someone' }));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isGSUser).toBe(false);
  });
});
