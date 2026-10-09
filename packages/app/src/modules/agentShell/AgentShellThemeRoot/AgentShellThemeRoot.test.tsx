import { useNavigate } from 'react-router-dom';
import { FeatureFlagState } from '@backstage/frontend-plugin-api';
import { mockApis, renderInTestApp } from '@backstage/frontend-test-utils';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AGENT_SHELL_FLAG } from '../predicates';
import { AgentShellThemeRoot } from './AgentShellThemeRoot';
import { useAgentShellAttribute } from './useAgentShellAttribute';

function GoTo({ to }: { to: string }) {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(to)}>
      go to {to}
    </button>
  );
}

async function renderAt(
  path: string,
  {
    flag = FeatureFlagState.Active,
    navigateTo = '',
  }: { flag?: FeatureFlagState; navigateTo?: string } = {},
) {
  await renderInTestApp(
    <>
      <AgentShellThemeRoot />
      {navigateTo && <GoTo to={navigateTo} />}
    </>,
    {
      initialRouteEntries: [path],
      apis: [
        mockApis.featureFlags({ initialStates: { [AGENT_SHELL_FLAG]: flag } }),
      ],
    },
  );
}

describe('AgentShellThemeRoot', () => {
  afterEach(() => {
    delete document.documentElement.dataset.agentShell;
  });

  it('marks the document root on an agent-area route while the flag is on', async () => {
    await renderAt('/');
    expect(document.documentElement).toHaveAttribute('data-agent-shell', '');
  });

  it('leaves the document unmarked outside the agent area', async () => {
    await renderAt('/clusters');
    expect(document.documentElement).not.toHaveAttribute('data-agent-shell');
  });

  it('leaves the document unmarked while the flag is off', async () => {
    await renderAt('/', { flag: FeatureFlagState.None });
    expect(document.documentElement).not.toHaveAttribute('data-agent-shell');
  });

  it('follows the location, so classic pages lose the mark on navigation', async () => {
    await renderAt('/agent-platform/sessions', { navigateTo: '/clusters' });
    expect(document.documentElement).toHaveAttribute('data-agent-shell', '');

    await userEvent.click(
      screen.getByRole('button', { name: 'go to /clusters' }),
    );

    expect(document.documentElement).not.toHaveAttribute('data-agent-shell');
  });
});

describe('useAgentShellAttribute', () => {
  afterEach(() => {
    delete document.documentElement.dataset.agentShell;
  });

  function Probe() {
    const active = useAgentShellAttribute();
    return <div data-testid="probe">{String(active)}</div>;
  }

  it('mirrors the data-agent-shell mark, following changes', async () => {
    await renderInTestApp(<Probe />);
    expect(screen.getByTestId('probe')).toHaveTextContent('false');

    await act(async () => {
      document.documentElement.dataset.agentShell = '';
      // MutationObserver callbacks run as microtasks.
      await Promise.resolve();
    });
    expect(screen.getByTestId('probe')).toHaveTextContent('true');

    await act(async () => {
      delete document.documentElement.dataset.agentShell;
      await Promise.resolve();
    });
    expect(screen.getByTestId('probe')).toHaveTextContent('false');
  });
});
