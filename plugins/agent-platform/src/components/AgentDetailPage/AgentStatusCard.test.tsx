import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import {
  Agent,
  Harness,
  type AgentInterface,
  type ClaudeHarnessLimits,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { AgentStatusCard } from './AgentStatusCard';

const mockUseResource = jest.fn();

jest.mock('@giantswarm/backstage-plugin-kubernetes-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-kubernetes-react'),
  useResource: (...args: unknown[]) => mockUseResource(...args),
}));

/** `null` names no Harness. */
function makeAgent(harness: string | null = 'claude-go'): Agent {
  return new Agent(
    {
      apiVersion: 'api.kagent.dev/v1alpha3',
      kind: 'Agent',
      metadata: { name: 'coder', namespace: 'kagent', generation: 1 },
      spec: {
        ...(harness && { harnessRef: { name: harness } }),
        template: { description: 'Writes Go' },
      },
    } as AgentInterface,
    'gazelle',
  );
}

function makeHarness(limits?: ClaudeHarnessLimits): Harness {
  return new Harness(
    {
      apiVersion: 'api.kagent.dev/v1alpha3',
      kind: 'Harness',
      metadata: { name: 'claude-go', namespace: 'kagent' },
      spec: {
        claude: limits ? { limits } : {},
        workload: { image: 'gsoci.azurecr.io/giantswarm/claude-go@sha256:0' },
        substrate: {
          workerPoolRef: { name: 'kagent' },
          snapshotPolicy: { location: 's3://snapshots/claude-go' },
        },
      },
    } as never,
    'gazelle',
  );
}

function stubHarnessRead(outcome: { resource?: Harness; error?: Error }) {
  mockUseResource.mockReturnValue({
    resource: outcome.resource,
    isLoading: false,
    error: outcome.error ?? null,
    errors: outcome.error ? [{ type: 'error', error: outcome.error }] : [],
  });
}

describe('AgentStatusCard', () => {
  beforeEach(() => mockUseResource.mockReset());

  it('reads the Harness the agent names, in the agent’s namespace', async () => {
    stubHarnessRead({ resource: makeHarness() });

    await renderInTestApp(<AgentStatusCard agent={makeAgent()} />);

    expect(mockUseResource).toHaveBeenCalledWith(
      'gazelle',
      Harness,
      expect.objectContaining({ name: 'claude-go', namespace: 'kagent' }),
      { enabled: true },
    );
  });

  it('shows the limits the Harness sets', async () => {
    stubHarnessRead({
      resource: makeHarness({ budgetUSD: '0.50', maxTurns: 30 }),
    });

    await renderInTestApp(<AgentStatusCard agent={makeAgent()} />);

    const group = screen.getByRole('group', { name: 'Limits' });
    expect(group).toHaveTextContent('Budget per turn');
    expect(group).toHaveTextContent('$0.50');
    expect(group).toHaveTextContent('Max turns');
    expect(group).toHaveTextContent('30');
    expect(group).toHaveTextContent(
      'Set on the Harness claude-go; they apply to every agent on it.',
    );
  });

  it('shows only the limits that are set', async () => {
    stubHarnessRead({ resource: makeHarness({ maxTurns: 12 }) });

    await renderInTestApp(<AgentStatusCard agent={makeAgent()} />);

    const group = screen.getByRole('group', { name: 'Limits' });
    expect(group).toHaveTextContent('Max turns');
    expect(group).not.toHaveTextContent('Budget per turn');
  });

  it('shows no limits when the Harness sets none', async () => {
    stubHarnessRead({ resource: makeHarness() });

    await renderInTestApp(<AgentStatusCard agent={makeAgent()} />);

    expect(screen.getByText(/Sessions run on|Runs on/)).toHaveTextContent(
      'claude-go',
    );
    expect(screen.queryByRole('group', { name: 'Limits' })).toBeNull();
  });

  it('keeps the card when the Harness cannot be read', async () => {
    stubHarnessRead({ error: new Error('harnesses.api.kagent.dev forbidden') });

    await renderInTestApp(<AgentStatusCard agent={makeAgent()} />);

    expect(screen.getByText(/Runs on/)).toHaveTextContent('Runs on claude-go');
    expect(screen.queryByRole('group', { name: 'Limits' })).toBeNull();
    expect(screen.queryByText(/forbidden/)).toBeNull();
  });

  it('asks for no Harness when the agent names none', async () => {
    stubHarnessRead({});

    await renderInTestApp(<AgentStatusCard agent={makeAgent(null)} />);

    expect(mockUseResource).toHaveBeenCalledWith(
      'gazelle',
      Harness,
      expect.objectContaining({ name: '' }),
      { enabled: false },
    );
    expect(screen.queryByRole('group', { name: 'Limits' })).toBeNull();
  });
});
