import { useState } from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { MCPServer } from '../../../lib/k8s';
import { ConnectorSettingsTab } from './ConnectorSettingsTab';

jest.mock('@giantswarm/backstage-plugin-flux-react', () => ({
  useGitOpsSource: () => ({ isLoading: false }),
}));

jest.mock('../../MusterInstanceProvider', () => ({
  useMusterMutationRefresh: () => jest.fn(),
}));

jest.mock('../../NewMcpServerReviewPage/useRegisterMcpServer', () => ({
  useRegisterMcpServer: () => {
    const [isSuccess, setSuccess] = jest.requireActual('react').useState(false);
    return {
      mutate: (_: unknown, options?: { onSuccess?: () => void }) => {
        setSuccess(true);
        options?.onSuccess?.();
      },
      reset: () => setSuccess(false),
      isPending: false,
      isSuccess,
      error: null,
    };
  },
}));

function jira(url: string): MCPServer {
  return new MCPServer(
    {
      apiVersion: 'muster.giantswarm.io/v1alpha1',
      kind: 'MCPServer',
      metadata: { name: 'jira', namespace: 'muster' },
      spec: {
        type: 'streamable-http',
        url,
        autoStart: true,
        auth: { type: 'oauth' },
      },
      status: { state: 'Connected' },
    } as never,
    'gazelle',
  );
}

function Harness() {
  const [server, setServer] = useState(() => jira('https://jira.test/mcp'));
  return (
    <>
      <button
        type="button"
        onClick={() => setServer(jira('https://jira.internal/mcp'))}
      >
        server caught up
      </button>
      <button
        type="button"
        onClick={() => setServer(jira('https://jira.elsewhere/mcp'))}
      >
        server changed elsewhere
      </button>
      <ConnectorSettingsTab
        row={{ kind: 'server', server } as never}
        representative={server}
        fleetClusters={[]}
        authenticated
      />
    </>
  );
}

describe('ConnectorSettingsTab', () => {
  it('cancels to what the server reads once it has caught up with a save', async () => {
    await renderInTestApp(<Harness />);

    const address = screen.getByRole('textbox', { name: /Server address/ });
    await userEvent.clear(address);
    await userEvent.type(address, 'https://jira.internal/mcp');
    await userEvent.click(
      screen.getByRole('button', { name: 'Save and reconnect' }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'server caught up' }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'server changed elsewhere' }),
    );

    await userEvent.clear(address);
    await userEvent.type(address, 'https://jira.typo/mcp');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(address).toHaveValue('https://jira.elsewhere/mcp');
  });
});
