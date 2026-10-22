import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import {
  musterApiRef,
  type MusterApi,
} from '@giantswarm/backstage-plugin-muster';

import { ChatGptConnectPrompt } from './ChatGptConnectPrompt';

// The dialog names servers by their MCPServer; it lists none here.
jest.mock('@giantswarm/backstage-plugin-kubernetes-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-kubernetes-react'),
  useResources: () => ({
    resources: [],
    errors: [],
    queries: [],
    isLoading: false,
    retry: jest.fn(),
  }),
}));

function makeApi() {
  return {
    getAuthStatus: jest.fn(() =>
      Promise.resolve({
        servers: [{ name: 'workspace-manager', status: 'auth_required' }],
        providerApps: [
          { name: 'chatgpt', status: 'auth_required' },
          { name: 'github', status: 'auth_required' },
        ],
      }),
    ),
    signInServer: jest.fn(),
    signOutServer: jest.fn(),
  } as unknown as MusterApi;
}

async function renderPrompt(hasHeldMessage?: boolean) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await renderInTestApp(
    <TestApiProvider apis={[[musterApiRef, makeApi()]]}>
      <QueryClientProvider client={queryClient}>
        <ChatGptConnectPrompt
          installation="graveler"
          hasHeldMessage={hasHeldMessage}
        />
      </QueryClientProvider>
    </TestApiProvider>,
  );
}

describe('ChatGptConnectPrompt', () => {
  it('asks the person to connect their ChatGPT subscription', async () => {
    await renderPrompt();

    expect(
      screen.getByText(
        'Connect your ChatGPT subscription to talk to this agent.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/This agent runs on your own ChatGPT subscription/),
    ).toBeInTheDocument();
  });

  it('says a held message goes once the person has connected', async () => {
    await renderPrompt(true);

    expect(
      screen.getByText(/Your message is sent as soon as you have connected it/),
    ).toBeInTheDocument();
  });

  it('opens the sign-in dialog on the ChatGPT row only', async () => {
    await renderPrompt();

    await userEvent.click(screen.getByRole('button', { name: 'Connect' }));

    const dialog = await screen.findByRole('dialog');
    const apps = await within(dialog).findByRole('list', {
      name: 'Connections',
    });
    expect(within(apps).getAllByRole('listitem')).toHaveLength(1);
    expect(apps).toHaveTextContent('ChatGPT');
    expect(
      within(dialog).queryByRole('list', { name: 'MCP servers' }),
    ).not.toBeInTheDocument();
  });
});
