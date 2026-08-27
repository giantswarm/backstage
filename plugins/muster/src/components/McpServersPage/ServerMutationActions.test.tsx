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
  authType?: 'oauth' | 'none';
}): MCPServer {
  return new MCPServer(
    {
      apiVersion: 'muster.giantswarm.io/v1alpha1',
      kind: 'MCPServer',
      metadata: { name: 'miro' },
      spec: {
        type: 'streamable-http',
        url: 'https://mcp.miro.com/',
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

describe('ServerMutationActions OAuth lifecycle gate', () => {
  it('disables Start/Restart for an OAuth server waiting on sign-in', async () => {
    await renderActions(
      makeServer({ state: 'Auth Required', authType: 'oauth' }),
    );

    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Restart' })).toBeDisabled();
    // Stop (suspend) and Delete stay live: both are valid for OAuth servers.
    expect(screen.getByRole('button', { name: 'Stop' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled();
  });

  it('explains the gate and points at the sign-in flow', async () => {
    await renderActions(
      makeServer({ state: 'Auth Required', authType: 'oauth' }),
    );

    await userEvent.hover(
      screen.getByRole('button', { name: 'Start' }).parentElement as Element,
    );
    expect(await screen.findByText(OAUTH_SIGN_IN_GATE)).toBeInTheDocument();
  });

  it('keeps Start/Restart for a stopped OAuth server (resume path)', async () => {
    // Starting a stopped/suspended OAuth server is a valid CR write and the
    // only way to resume it -- the gate must be state-scoped, not type-scoped.
    await renderActions(makeServer({ state: 'Stopped', authType: 'oauth' }));

    expect(screen.getByRole('button', { name: 'Start' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Restart' })).toBeEnabled();
  });

  it('keeps Start/Restart for non-OAuth servers regardless of state', async () => {
    await renderActions(makeServer({ state: 'Auth Required' }));

    expect(screen.getByRole('button', { name: 'Start' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Restart' })).toBeEnabled();
  });
});
