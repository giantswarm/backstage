import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { externalUrlConsentApiRef } from '@giantswarm/backstage-plugin-ui-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ToolchainGrantPrompt } from './ToolchainGrantPrompt';

/** muster's sign-in of each App, by name, as the test moves it along. */
const mockSignIns: Record<string, { isConnected: boolean }> = {};
jest.mock('@giantswarm/backstage-plugin-muster', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-muster'),
  useServerSignIn: (name: string) => ({
    isWaiting: false,
    isConnected: mockSignIns[name]?.isConnected ?? false,
    isPending: false,
    signInTabOpened: false,
    authUrl: 'https://muster.example/sign-in',
    error: undefined,
    signIn: jest.fn(),
  }),
}));

const INSTALL_URL =
  'https://github.com/apps/toolchain-manager/installations/new';

describe('ToolchainGrantPrompt', () => {
  it("asks before opening the manager's install page", async () => {
    const open = jest.fn().mockResolvedValue('accept');
    await renderInTestApp(
      <TestApiProvider apis={[[externalUrlConsentApiRef, { open }]]}>
        <QueryClientProvider client={new QueryClient()}>
          <ToolchainGrantPrompt
            installation="gazelle"
            answer={{
              status: 'install_required',
              installURL: INSTALL_URL,
              message: 'The App is not installed on acme/toolchains.',
            }}
          />
        </QueryClientProvider>
      </TestApiProvider>,
    );

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', {
        name: 'Install the App (opens in a new tab)',
      }),
    );

    expect(open).toHaveBeenCalledWith({
      url: INSTALL_URL,
      requester: 'toolchain-manager',
    });
  });

  it('offers a sign-in for every App muster names, and carries on once all are granted', async () => {
    const onConnected = jest.fn();
    mockSignIns['toolchain-manager'] = { isConnected: true };
    mockSignIns['toolchain-gitlab'] = { isConnected: true };
    await renderInTestApp(
      <TestApiProvider apis={[[externalUrlConsentApiRef, { open: jest.fn() }]]}>
        <QueryClientProvider client={new QueryClient()}>
          <ToolchainGrantPrompt
            installation="gazelle"
            answer={{
              status: 'grant_required',
              apps: ['toolchain-manager', 'toolchain-gitlab'],
            }}
            onConnected={onConnected}
          />
        </QueryClientProvider>
      </TestApiProvider>,
    );

    const first = screen.getByTestId('provider-connect-toolchain-manager');
    const second = screen.getByTestId('provider-connect-toolchain-gitlab');
    await userEvent.click(
      within(first).getByRole('button', { name: /Continue with GitHub/ }),
    );
    expect(onConnected).not.toHaveBeenCalled();
    await userEvent.click(
      within(second).getByRole('button', { name: /Continue with GitHub/ }),
    );
    await waitFor(() => expect(onConnected).toHaveBeenCalledTimes(1));
  });
});
