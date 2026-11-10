import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { externalUrlConsentApiRef } from '@giantswarm/backstage-plugin-ui-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ToolchainGrantPrompt } from './ToolchainGrantPrompt';

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
});
