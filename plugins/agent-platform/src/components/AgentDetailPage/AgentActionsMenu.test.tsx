import { renderInTestApp } from '@backstage/test-utils';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { crds } from '@giantswarm/k8s-types';
import { Agent } from '@giantswarm/backstage-plugin-kubernetes-react';
import { AgentActionsMenu } from './AgentActionsMenu';

type AgentInterface = crds.kagent.v1alpha2.Agent;

function makeAgent(): Agent {
  return new Agent(
    {
      apiVersion: 'kagent.dev/v1alpha2',
      kind: 'Agent',
      metadata: {
        name: 'pr-reviewer',
        namespace: 'agentic-platform',
        managedFields: [{ manager: 'helm-controller', operation: 'Apply' }],
      },
      spec: {
        type: 'Declarative',
        declarative: { modelConfig: 'opus-4-7' },
      },
    } as AgentInterface,
    'gazelle',
  );
}

describe('AgentActionsMenu', () => {
  it('opens the manifest dialog from the kebab menu', async () => {
    await renderInTestApp(<AgentActionsMenu agent={makeAgent()} />);

    // Nothing is shown until asked for — this is the rarely-needed escape hatch.
    expect(screen.queryByText('Agent manifest')).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: 'Agent actions' }),
    );
    await userEvent.click(
      screen.getByRole('menuitem', { name: 'View manifest' }),
    );

    await waitFor(() => {
      expect(screen.getByText('Agent manifest')).toBeInTheDocument();
    });
    expect(screen.getByText('pr-reviewer.yaml')).toBeInTheDocument();
    // Names the installation and namespace, so a manifest copied out of here can
    // be traced back to where it came from.
    expect(screen.getByText('gazelle · agentic-platform')).toBeInTheDocument();
  });
});
