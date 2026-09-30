import { useState } from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  renderInTestApp,
  TestApiProvider,
} from '@backstage/frontend-test-utils';
import { musterApiRef } from '../../apis';
import { MCPServer, MCPServerState } from '../../lib/k8s';
import {
  MusterInstance,
  MusterInstanceContext,
} from '../MusterInstanceProvider';
import {
  ConfirmActionDialog,
  LiveAction,
  OAUTH_SIGN_IN_GATE,
  serverLiveActions,
} from './serverActions';

function makeServer(options: {
  state?: MCPServerState;
  authType?: 'oauth' | 'none' | 'sigv4';
  suspended?: boolean;
}): MCPServer {
  return new MCPServer(
    {
      apiVersion: 'muster.giantswarm.io/v1alpha1',
      kind: 'MCPServer',
      metadata: { name: 'miro' },
      spec: {
        type: 'streamable-http',
        url: 'https://mcp.miro.com/',
        ...(options.suspended !== undefined
          ? { suspended: options.suspended }
          : {}),
        ...(options.authType ? { auth: { type: options.authType } } : {}),
      },
      ...(options.state ? { status: { state: options.state } } : {}),
    } as never,
    'gazelle',
  );
}

describe('serverLiveActions', () => {
  it('offers Deactivate and Reconnect, never Activate, for an active server', () => {
    const live = serverLiveActions(makeServer({ state: 'Connected' }));
    expect(live.deactivate?.tool).toBe('core_service_stop');
    expect(live.reconnect?.tool).toBe('core_service_restart');
    expect(live.activate).toBeUndefined();
    expect(live.remove).toMatchObject({
      tool: 'core_mcpserver_delete',
      args: { name: 'miro' },
      destructive: true,
    });
  });

  it('offers only Activate for a suspended server', () => {
    const live = serverLiveActions(
      makeServer({ state: 'Disconnected', suspended: true }),
    );
    expect(live.activate?.tool).toBe('core_service_start');
    expect(live.deactivate).toBeUndefined();
    expect(live.reconnect).toBeUndefined();
  });

  it('gates Reconnect for an OAuth server waiting on a sign-in', () => {
    expect(
      serverLiveActions(
        makeServer({ state: 'Auth Required', authType: 'oauth' }),
      ).reconnectGate,
    ).toBe(OAUTH_SIGN_IN_GATE);
  });

  it.each([
    ['a failed OAuth server (the retry path)', 'Failed', 'oauth'],
    ['a non-OAuth server in Auth Required', 'Auth Required', 'none'],
    ['a sigv4 server, where reconnecting is the remedy', 'Failed', 'sigv4'],
  ] as const)('keeps Reconnect for %s', (_, state, authType) => {
    expect(
      serverLiveActions(makeServer({ state, authType })).reconnectGate,
    ).toBeUndefined();
  });
});

/** Minimal provider value, so the dialog's post-mutation refresh is observable. */
function makeInstance(retry: () => void): MusterInstance {
  return {
    installations: ['gazelle'],
    isLoadingInstallations: false,
    installationInfos: [],
    activeInstallation: 'gazelle',
    scope: 'gazelle',
    homeInstallation: 'gazelle',
    isSingleInstallation: false,
    activeInstallationInfo: undefined,
    setActiveInstallation: jest.fn(),
    mcpServers: [],
    workflows: [],
    isLoading: false,
    retry,
    refreshInventory: jest.fn(),
  };
}

/** Two buttons standing in for the header's menu, one dialog. */
function Harness({
  server,
  onDone,
}: {
  server: MCPServer;
  onDone?: (action: LiveAction) => void;
}) {
  const live = serverLiveActions(server);
  const [action, setAction] = useState<LiveAction | undefined>();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setAction(live.deactivate);
          setOpen(true);
        }}
      >
        open deactivate
      </button>
      <button
        type="button"
        onClick={() => {
          setAction(live.reconnect);
          setOpen(true);
        }}
      >
        open reconnect
      </button>
      <ConfirmActionDialog
        server={server}
        action={action}
        open={open}
        onClose={() => setOpen(false)}
        onDone={onDone}
      />
    </>
  );
}

async function renderDialog(
  options: {
    callTool?: jest.Mock;
    onDone?: (action: LiveAction) => void;
  } = {},
) {
  const retry = jest.fn();
  const callTool = options.callTool ?? jest.fn(async () => ({}));
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const invalidateQueries = jest.spyOn(queryClient, 'invalidateQueries');
  await renderInTestApp(
    <TestApiProvider apis={[[musterApiRef, { callTool }]]}>
      <QueryClientProvider client={queryClient}>
        <MusterInstanceContext.Provider value={makeInstance(retry)}>
          <Harness
            server={makeServer({ state: 'Connected' })}
            onDone={options.onDone}
          />
        </MusterInstanceContext.Provider>
      </QueryClientProvider>
    </TestApiProvider>,
  );
  return { retry, callTool, invalidateQueries };
}

/**
 * A muster mutation writes the CR synchronously, so the UI must refetch the
 * CRD reads right after a successful call instead of waiting for the next
 * background poll (up to 30s, longer in an unfocused tab where react-query
 * pauses `refetchInterval`).
 */
describe('ConfirmActionDialog', () => {
  it('says what muster will do, runs the tool and refetches the reads', async () => {
    const onDone = jest.fn();
    const { retry, callTool, invalidateQueries } = await renderDialog({
      onDone,
    });

    await userEvent.click(
      screen.getByRole('button', { name: 'open deactivate' }),
    );
    expect(
      await screen.findByText(/muster will disconnect this server/),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(
      await screen.findByText(/Done\. The server list has been refreshed/),
    ).toBeInTheDocument();
    expect(callTool).toHaveBeenCalledWith(
      'core_service_stop',
      { name: 'miro' },
      'gazelle',
    );
    expect(retry).toHaveBeenCalled();
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['muster', 'servers', 'gazelle'],
    });
    expect(onDone).toHaveBeenCalledWith(
      expect.objectContaining({ tool: 'core_service_stop' }),
    );
  });

  it("opens the next action fresh, not on the last one's result", async () => {
    await renderDialog();

    await userEvent.click(
      screen.getByRole('button', { name: 'open deactivate' }),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Confirm' }),
    );
    await screen.findByText(/Done\. The server list has been refreshed/);
    const closes = screen.getAllByRole('button', { name: 'Close' });
    await userEvent.click(closes[closes.length - 1]);

    await userEvent.click(
      screen.getByRole('button', { name: 'open reconnect' }),
    );

    expect(
      await screen.findByRole('button', { name: 'Confirm' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Done\. The server list has been refreshed/),
    ).not.toBeInTheDocument();
  });

  it('neither refetches nor reports done when the mutation fails', async () => {
    const onDone = jest.fn();
    const { retry } = await renderDialog({
      callTool: jest.fn(() => Promise.reject(new Error('boom'))),
      onDone,
    });

    await userEvent.click(
      screen.getByRole('button', { name: 'open deactivate' }),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Confirm' }),
    );

    expect(await screen.findByText('boom')).toBeInTheDocument();
    expect(retry).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });
});
