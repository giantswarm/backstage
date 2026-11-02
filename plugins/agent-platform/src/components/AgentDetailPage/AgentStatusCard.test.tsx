import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import {
  Agent,
  type AgentInterface,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { AgentStatusCard } from './AgentStatusCard';

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

describe('AgentStatusCard', () => {
  it('names the Harness the agent runs on, and no limits', async () => {
    await renderInTestApp(<AgentStatusCard agent={makeAgent()} />);

    expect(screen.getByText(/Sessions run on|Runs on/)).toHaveTextContent(
      'claude-go',
    );
    expect(screen.queryByRole('group', { name: 'Limits' })).toBeNull();
    expect(screen.queryByText(/per turn/)).toBeNull();
  });

  it('shows no Harness line when the agent names none', async () => {
    await renderInTestApp(<AgentStatusCard agent={makeAgent(null)} />);

    expect(screen.queryByText(/Sessions run on|Runs on/)).toBeNull();
  });
});
