import { PropsWithChildren } from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { TestApiProvider } from '@backstage/frontend-test-utils';
import {
  SecretsContextProvider,
  useTemplateSecrets,
} from '@backstage/plugin-scaffolder-react';
import {
  kubernetesApiRef,
  kubernetesAuthProvidersApiRef,
} from '@backstage/plugin-kubernetes-react';
import {
  TemplateSecretRefreshProvider,
  useRefreshTemplateSecrets,
} from '../SecretRefresh';
import { OIDCToken } from './OIDCToken';
import { OIDCTokenProps } from './schema';

const kubernetesApi = {
  getCluster: jest.fn().mockResolvedValue({
    name: 'golem',
    authProvider: 'oidc',
    oidcTokenProvider: 'oidc-golem',
  }),
};
const kubernetesAuthProvidersApi = {
  getCredentials: jest.fn(),
};

let probe: {
  refreshAll: () => Promise<Record<string, string>>;
  secrets: Record<string, string>;
};

function Probe() {
  probe = {
    refreshAll: useRefreshTemplateSecrets(),
    secrets: useTemplateSecrets().secrets,
  };
  return null;
}

function Wrapper({ children }: PropsWithChildren<{}>) {
  return (
    <TestApiProvider
      apis={[
        [kubernetesApiRef, kubernetesApi],
        [kubernetesAuthProvidersApiRef, kubernetesAuthProvidersApi],
      ]}
    >
      <SecretsContextProvider>
        <TemplateSecretRefreshProvider>
          {children}
          <Probe />
        </TemplateSecretRefreshProvider>
      </SecretsContextProvider>
    </TestApiProvider>
  );
}

const fieldProps = {
  rawErrors: [],
  required: true,
  formData: undefined,
  schema: {},
  uiSchema: {
    'ui:options': { secretsKey: 'USER_OIDC_TOKEN', installationName: 'golem' },
  },
  idSchema: { $id: 'token' },
  formContext: { formData: {} },
  onChange: jest.fn(),
} as unknown as OIDCTokenProps;

describe('OIDCToken', () => {
  beforeEach(() => {
    kubernetesAuthProvidersApi.getCredentials.mockReset();
  });

  it('mints a new token for the installation when the template is submitted', async () => {
    kubernetesAuthProvidersApi.getCredentials
      .mockResolvedValueOnce({ token: 'filled-in-token' })
      .mockResolvedValueOnce({ token: 'submit-token' });

    const { unmount } = render(<OIDCToken {...fieldProps} />, {
      wrapper: Wrapper,
    });
    await waitFor(() =>
      expect(probe.secrets).toEqual({ USER_OIDC_TOKEN: 'filled-in-token' }),
    );

    let fresh: Record<string, string> = {};
    await act(async () => {
      fresh = await probe.refreshAll();
    });

    expect(fresh).toEqual({ USER_OIDC_TOKEN: 'submit-token' });
    expect(kubernetesAuthProvidersApi.getCredentials).toHaveBeenLastCalledWith(
      'oidc.oidc-golem',
    );
    unmount();
  });

  it('fails the refresh when no token comes back', async () => {
    kubernetesAuthProvidersApi.getCredentials.mockResolvedValue({});

    render(<OIDCToken {...fieldProps} />, { wrapper: Wrapper });

    await act(async () => {
      await expect(probe.refreshAll()).rejects.toThrow(
        'No token for installation "golem".',
      );
    });
  });
});
