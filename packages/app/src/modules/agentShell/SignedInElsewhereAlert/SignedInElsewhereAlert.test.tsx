import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  errorApiRef,
  type OAuthRequestApi,
  oauthRequestApiRef,
  type PendingOAuthRequest,
} from '@backstage/frontend-plugin-api';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import {
  type GSAuthProvidersApi,
  gsAuthProvidersApiRef,
} from '@giantswarm/backstage-plugin-gs';
import { SignedInElsewhereAlert } from './SignedInElsewhereAlert';

function pendingRequest(providerId: string): PendingOAuthRequest {
  return {
    provider: { id: providerId, title: providerId, icon: () => null },
    trigger: jest.fn().mockResolvedValue(undefined),
    reject: jest.fn(),
  };
}

async function renderAlert({
  reason,
  requests = [],
}: {
  reason: 'signed-in-elsewhere' | undefined;
  requests?: PendingOAuthRequest[];
}) {
  const signIn = jest.fn().mockResolvedValue(undefined);
  const signOut = jest.fn().mockResolvedValue(undefined);
  const errorApi = { post: jest.fn(), error$: jest.fn() };
  await renderInTestApp(<SignedInElsewhereAlert />, {
    apis: [
      [
        gsAuthProvidersApiRef,
        {
          getMainSessionEnd: () => ({
            reason: () => reason,
            subscribe: () => () => {},
          }),
          getMainAuthApi: () => ({ signIn, signOut }),
        } as unknown as GSAuthProvidersApi,
      ],
      [
        oauthRequestApiRef,
        {
          createAuthRequester: jest.fn(),
          authRequest$: () => ({
            subscribe: (next: (value: PendingOAuthRequest[]) => void) => {
              next(requests);
              return { unsubscribe: () => {}, closed: false };
            },
          }),
        } as unknown as OAuthRequestApi,
      ],
      [errorApiRef, errorApi],
    ],
    config: {
      app: { baseUrl: 'http://localhost:3000' },
      gs: { authProvider: 'oidc-gazelle' },
    },
  });
  return { signIn, signOut, errorApi };
}

describe('SignedInElsewhereAlert', () => {
  it('shows nothing while the session holds', async () => {
    await renderAlert({ reason: undefined });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('says the person signed in somewhere else and offers to sign in again', async () => {
    await renderAlert({ reason: 'signed-in-elsewhere' });

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('You signed in somewhere else');
    expect(alert).toHaveTextContent('Sign in again here to keep working.');
    expect(
      screen.getByRole('button', { name: 'Sign in again' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Close' }),
    ).not.toBeInTheDocument();
  });

  it('opens the sign-in the main login already asked for', async () => {
    const other = pendingRequest('mcp-grafana');
    const main = pendingRequest('oidc-gazelle');
    const { signIn, signOut } = await renderAlert({
      reason: 'signed-in-elsewhere',
      requests: [other, main],
    });

    await userEvent.click(
      screen.getByRole('button', { name: 'Sign in again' }),
    );

    await waitFor(() => expect(main.trigger).toHaveBeenCalledTimes(1));
    expect(other.trigger).not.toHaveBeenCalled();
    expect(signIn).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it('drops the ended session and asks the main login to sign in when nothing is pending', async () => {
    const { signIn, signOut } = await renderAlert({
      reason: 'signed-in-elsewhere',
    });

    await userEvent.click(
      screen.getByRole('button', { name: 'Sign in again' }),
    );

    await waitFor(() => expect(signIn).toHaveBeenCalledTimes(1));
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(signOut.mock.invocationCallOrder[0]).toBeLessThan(
      signIn.mock.invocationCallOrder[0],
    );
  });

  it('reports a sign-in that failed', async () => {
    const main = pendingRequest('oidc-gazelle');
    const failure = new Error('Login failed, popup was closed');
    (main.trigger as jest.Mock).mockRejectedValue(failure);
    const { errorApi } = await renderAlert({
      reason: 'signed-in-elsewhere',
      requests: [main],
    });

    await userEvent.click(
      screen.getByRole('button', { name: 'Sign in again' }),
    );

    await waitFor(() => expect(errorApi.post).toHaveBeenCalledWith(failure));
  });
});
