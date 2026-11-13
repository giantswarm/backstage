import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import {
  Agent,
  AgentCondition,
  AgentInterface,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { modelsRouteRef } from '../../routes';
import { AgentSessionBlocker } from './AgentSessionBlocker';
import type { AgentCreatedHandoff } from '../../hooks/useAgentCreatedHandoff';

let mockHandoff: AgentCreatedHandoff | undefined;
jest.mock('../../hooks/useAgentCreatedHandoff', () => ({
  useAgentCreatedHandoff: () => mockHandoff,
}));

beforeEach(() => {
  mockHandoff = undefined;
});

const AT = '2026-11-08T12:00:00Z';

function condition(
  type: string,
  status: 'True' | 'False',
  reason: string,
  message: string,
): AgentCondition {
  return { type, status, reason, message, lastTransitionTime: AT };
}

/** An agent with one private git skill fetched with `skills-token`. */
function agentWith(conditions: AgentCondition[]): Agent {
  return new Agent(
    {
      apiVersion: 'api.kagent.dev/v1alpha3',
      kind: 'Agent',
      metadata: {
        name: 'kyverno-policy-author',
        namespace: 'kagent',
        generation: 1,
      },
      spec: {
        harnessRef: { name: 'kagent' },
        template: {
          skills: [
            {
              name: 'kyverno',
              source: {
                git: {
                  url: 'https://github.com/giantswarm/claude-code',
                  commit: 'a'.repeat(40),
                  credentialRef: { name: 'skills-token', key: 'token' },
                },
              },
            },
          ],
        },
      },
      status: { conditions, observedGeneration: 1 },
    } as unknown as AgentInterface,
    'gazelle',
  );
}

const accepted = condition('Accepted', 'True', 'Accepted', 'admitted');

describe('AgentSessionBlocker', () => {
  it('says the credential Secret is missing, offering no edit', async () => {
    const agent = agentWith([
      accepted,
      condition(
        'ResolvedRefs',
        'False',
        'ReferenceResolutionFailed',
        'build revision provenance: secret "skills-token" not found',
      ),
      condition('Compatible', 'False', 'Blocked', 'blocked by ResolvedRefs'),
      condition('Ready', 'False', 'Blocked', 'blocked by ResolvedRefs'),
    ]);

    await renderInTestApp(
      <AgentSessionBlocker agent={agent} onEdit={jest.fn()} />,
    );

    expect(screen.getByText('Sessions cannot start')).toBeInTheDocument();
    expect(
      screen.getByText(
        /The credential Secret skills-token that the agent fetches its private skills with is missing in the namespace kagent\. Once the Secret exists, the agent recovers on its own/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Edit agent' }),
    ).not.toBeInTheDocument();
  });

  it.each([undefined, 'created', 'updated', 'skills-updated'] as const)(
    'points at the boot log with handoff %s',
    async action => {
      if (action) {
        mockHandoff = {
          installation: 'gazelle',
          namespace: 'kagent',
          name: 'kyverno-policy-author',
          action,
        };
      }
      const agent = agentWith([
        accepted,
        condition('ResolvedRefs', 'True', 'Resolved', 'resolved'),
        condition('Compatible', 'True', 'Compatible', 'compatible'),
        condition(
          'Ready',
          'False',
          'ActorTemplatePending',
          'waiting for the ActorTemplate golden snapshot',
        ),
      ]);

      await renderInTestApp(<AgentSessionBlocker agent={agent} />);

      expect(
        screen.getByText('Sessions can start once the agent is ready'),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/The agent has not booted yet.*the boot log/),
      ).toBeInTheDocument();
    },
  );

  describe('for the default agent without a model', () => {
    const unresolved = agentWith([
      accepted,
      condition(
        'ResolvedRefs',
        'False',
        'ReferenceResolutionFailed',
        'no ModelConfig',
      ),
      condition('Ready', 'False', 'Blocked', 'blocked by ResolvedRefs'),
    ]);

    it('says to add one under Models', async () => {
      await renderInTestApp(
        <AgentSessionBlocker agent={unresolved} isPlatformOwned awaitsModel />,
        { mountedRoutes: { '/customize/models': modelsRouteRef } },
      );

      expect(screen.getByText('Sessions cannot start')).toBeInTheDocument();
      expect(
        screen.getByText(/^No model yet\. Add one under/),
      ).toHaveTextContent('No model yet. Add one under Models.');
      expect(screen.getByRole('link', { name: 'Models' })).toHaveAttribute(
        'href',
        '/customize/models',
      );
    });

    it('says nothing of it otherwise', async () => {
      await renderInTestApp(
        <AgentSessionBlocker agent={unresolved} isPlatformOwned />,
      );

      expect(screen.queryByText(/No model yet/)).not.toBeInTheDocument();
    });
  });
});
