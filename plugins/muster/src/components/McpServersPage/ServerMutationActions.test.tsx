import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { musterApiRef } from '../../apis';
import { MCPServer, MCPServerState } from '../../lib/k8s';
import {
  OAUTH_SIGN_IN_GATE,
  ServerMutationActions,
} from './ServerMutationActions';

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

async function renderActions(server: MCPServer) {
  const musterApi = { callTool: jest.fn() };
  return renderInTestApp(
    <TestApiProvider apis={[[musterApiRef, musterApi]]}>
      <ServerMutationActions server={server} />
    </TestApiProvider>,
  );
}

describe('ServerMutationActions lifecycle affordances', () => {
  it('shows Deactivate + Reconnect (never Activate) for an active server', async () => {
    await renderActions(makeServer({ state: 'Connected' }));

    expect(screen.getByRole('button', { name: 'Deactivate' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Reconnect' })).toBeEnabled();
    expect(
      screen.queryByRole('button', { name: 'Activate' }),
    ).not.toBeInTheDocument();
  });

  it('shows only Activate for a suspended server', async () => {
    // Activate/Deactivate are two directions of one durable switch
    // (spec.suspended), so exactly one renders; Reconnect is hidden because
    // muster refuses core_service_restart while suspended.
    await renderActions(
      makeServer({ state: 'Disconnected', suspended: true, authType: 'oauth' }),
    );

    expect(screen.getByRole('button', { name: 'Activate' })).toBeEnabled();
    expect(
      screen.queryByRole('button', { name: 'Deactivate' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Reconnect' }),
    ).not.toBeInTheDocument();
    // Delete stays live regardless of lifecycle state.
    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled();
  });

  it('disables Reconnect for an OAuth server waiting on sign-in', async () => {
    await renderActions(
      makeServer({ state: 'Auth Required', authType: 'oauth' }),
    );

    expect(screen.getByRole('button', { name: 'Reconnect' })).toBeDisabled();
    // Deactivate (suspend) is always a valid write for OAuth servers.
    expect(screen.getByRole('button', { name: 'Deactivate' })).toBeEnabled();
  });

  it('explains the Reconnect gate and points at the sign-in flow', async () => {
    await renderActions(
      makeServer({ state: 'Auth Required', authType: 'oauth' }),
    );

    await userEvent.hover(
      screen.getByRole('button', { name: 'Reconnect' })
        .parentElement as Element,
    );
    expect(await screen.findByText(OAUTH_SIGN_IN_GATE)).toBeInTheDocument();
  });

  it('keeps Reconnect live for a failed OAuth server (retry path)', async () => {
    // The gate is state-scoped, not type-scoped: reconnecting a *failed*
    // OAuth server is a valid retry that muster accepts.
    await renderActions(makeServer({ state: 'Failed', authType: 'oauth' }));

    expect(screen.getByRole('button', { name: 'Reconnect' })).toBeEnabled();
  });

  it('keeps Reconnect live for non-OAuth servers regardless of state', async () => {
    await renderActions(makeServer({ state: 'Auth Required' }));

    expect(screen.getByRole('button', { name: 'Reconnect' })).toBeEnabled();
  });

  it('says what muster will do in the confirm dialog', async () => {
    await renderActions(makeServer({ state: 'Connected' }));

    await userEvent.click(screen.getByRole('button', { name: 'Deactivate' }));

    expect(
      await screen.findByText(/keep it deactivated until it is activated/),
    ).toBeInTheDocument();
    // The underlying tool stays visible for transparency.
    expect(screen.getByText('core_service_stop')).toBeInTheDocument();
  });

  it('keeps Reconnect live for a sigv4 server: reconnecting is the remedy', async () => {
    // A sigv4 server has no per-user sign-in, so nothing about it is waiting on
    // a session. muster keeps a rejected credential in `Failed` and retries;
    // reconnecting after fixing the region or the role is exactly the right
    // move, and the OAuth sign-in gate must not swallow it.
    await renderActions(makeServer({ state: 'Failed', authType: 'sigv4' }));

    expect(screen.getByRole('button', { name: 'Reconnect' })).toBeEnabled();
  });
});
