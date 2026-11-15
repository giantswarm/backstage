import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { agentsRouteRef, modelsRouteRef } from '../../routes';
import type { AgentRow } from '../AgentsDataProvider';
import { DefaultAgentsBlockedAlert } from './DefaultAgentsBlockedAlert';
import {
  blockedDefaultAgents,
  defaultAgentsToRead,
  type BlockedDefaultAgent,
} from './blockedDefaultAgents';
import type { AgentManagerAgent } from '../../lib/agentManager';
import type { AgentManagerAgentReading } from '../../hooks/useAgentManagerAgents';

function defaultAgent(
  installation: string,
  namespace = 'kagent',
  overrides: Partial<AgentRow> = {},
): AgentRow {
  return {
    id: `${installation}/${namespace}/default-agent`,
    installation,
    namespace,
    name: 'General Assistant',
    technicalName: 'default-agent',
    description: 'Start here.',
    tags: [],
    skillCount: 0,
    readiness: 'failed',
    ...overrides,
  };
}

const noModel = (agent: AgentRow): BlockedDefaultAgent => ({
  agent,
  reason: 'no-model',
});
const failed = (agent: AgentRow, message?: string): BlockedDefaultAgent => ({
  agent,
  reason: 'failed',
  message,
});

/** The alert whose title is `title`. */
const alertOf = (title: string) =>
  screen.getByText(title).closest('.bui-Alert');

function render(blocked: BlockedDefaultAgent[]) {
  return renderInTestApp(<DefaultAgentsBlockedAlert blocked={blocked} />, {
    mountedRoutes: {
      '/customize/agents': agentsRouteRef,
      '/customize/models': modelsRouteRef,
    },
  });
}

describe('blockedDefaultAgents', () => {
  const ids = (...agents: AgentRow[]) => new Set(agents.map(({ id }) => id));
  /** agent-manager's `get_agent`: the platform's default agent, no model. */
  const awaiting = (agent: AgentRow): AgentManagerAgent => ({
    name: agent.technicalName,
    namespace: agent.namespace,
    exists: true,
    ready: false,
    managed: 'platform',
    default: true,
  });
  const read = (
    ...entries: [AgentRow, AgentManagerAgent | undefined][]
  ): Map<string, AgentManagerAgentReading> =>
    new Map(
      entries.map(([agent, answer]) => [
        agent.id,
        { agent: answer, settled: true },
      ]),
    );

  it('says no model where agent-manager confirms the platform agent waits for one, short of ready', () => {
    const failedOne = defaultAgent('golem');
    const pending = defaultAgent('lab', 'kagent', { readiness: 'pending' });
    const ready = defaultAgent('moon', 'kagent', { readiness: 'ready' });

    expect(
      blockedDefaultAgents(
        [failedOne, pending, ready],
        ids(failedOne, pending, ready),
        read([failedOne, awaiting(failedOne)], [pending, awaiting(pending)]),
      ),
    ).toEqual([noModel(failedOne), noModel(pending)]);
  });

  it("gives the controller's message for a default agent that is not the platform's", () => {
    const own = defaultAgent('golem', 'kagent', {
      readinessMessage: 'ModelConfig not set',
    });

    expect(
      blockedDefaultAgents(
        [own],
        ids(own),
        read([own, { ...awaiting(own), managed: 'helmrelease' }]),
      ),
    ).toEqual([failed(own, 'ModelConfig not set')]);
  });

  it("gives the controller's message where agent-manager could not be read", () => {
    const unread = defaultAgent('golem', 'kagent', {
      readinessMessage: 'Harness boot failed',
    });

    expect(
      blockedDefaultAgents([unread], ids(unread), read([unread, undefined])),
    ).toEqual([failed(unread, 'Harness boot failed')]);
  });

  it('waits for agent-manager before saying anything about an agent naming no model', () => {
    const agent = defaultAgent('golem');

    expect(
      blockedDefaultAgents(
        [agent],
        ids(agent),
        new Map([[agent.id, { settled: false }]]),
      ),
    ).toEqual([]);
  });

  it('never says no model for an agent running a referenced template, whose model it does not read', () => {
    const templated = defaultAgent('golem', 'kagent', {
      templateRef: 'general',
      readinessMessage: 'Secret anthropic-key not found',
    });
    const converging = defaultAgent('lab', 'kagent', {
      templateRef: 'general',
      readiness: 'notReady',
    });

    expect(
      blockedDefaultAgents(
        [templated, converging],
        ids(templated, converging),
        read(
          [templated, awaiting(templated)],
          [converging, awaiting(converging)],
        ),
      ),
    ).toEqual([failed(templated, 'Secret anthropic-key not found')]);
  });

  it("reports a default agent with a model once it failed, with the controller's message", () => {
    const broken = defaultAgent('golem', 'kagent', {
      modelConfigId: 'golem/kagent/claude',
      readinessMessage: ' Harness boot failed ',
    });
    const converging = defaultAgent('lab', 'kagent', {
      modelConfigId: 'lab/kagent/claude',
      readiness: 'notReady',
    });

    expect(
      blockedDefaultAgents(
        [broken, converging],
        ids(broken, converging),
        read(),
      ),
    ).toEqual([failed(broken, 'Harness boot failed')]);
  });

  it('leaves out an agent that is not a default one', () => {
    const agent = defaultAgent('golem');
    expect(
      blockedDefaultAgents([agent], new Set(), read([agent, awaiting(agent)])),
    ).toEqual([]);
  });

  it('sorts by environment, then namespace', () => {
    const a = defaultAgent('lab', 'org-b');
    const b = defaultAgent('golem');
    const c = defaultAgent('lab', 'org-a');

    expect(
      blockedDefaultAgents(
        [a, b, c],
        ids(a, b, c),
        read([a, awaiting(a)], [b, awaiting(b)], [c, awaiting(c)]),
      ).map(({ agent }) => agent.id),
    ).toEqual([b.id, c.id, a.id]);
  });
});

describe('defaultAgentsToRead', () => {
  it('names the unready default agents that name no model of their own', () => {
    const bare = defaultAgent('golem');
    const withModel = defaultAgent('lab', 'kagent', {
      modelConfigId: 'lab/kagent/claude',
    });
    const templated = defaultAgent('moon', 'kagent', {
      templateRef: 'general',
    });
    const ready = defaultAgent('sun', 'kagent', { readiness: 'ready' });
    const other = defaultAgent('star');

    expect(
      defaultAgentsToRead(
        [bare, withModel, templated, ready, other],
        new Set([bare.id, withModel.id, templated.id, ready.id]),
      ),
    ).toEqual([bare]);
  });
});

describe('DefaultAgentsBlockedAlert', () => {
  it('renders nothing for none', async () => {
    await render([]);

    expect(screen.queryByText(/cannot start sessions/)).not.toBeInTheDocument();
  });

  describe('for one agent', () => {
    it('names its environment and namespace, linked to the agent, and where to add a model', async () => {
      await render([noModel(defaultAgent('golem'))]);

      expect(
        screen.getByText('General Assistant cannot start sessions'),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/^No model yet on/).closest('p, span, div'),
      ).toHaveTextContent(
        'No model yet on golem, namespace kagent. Add one under Models.',
      );
      expect(
        screen.getByRole('link', { name: 'golem, namespace kagent' }),
      ).toHaveAttribute('href', '/customize/agents/golem/kagent/default-agent');
      expect(screen.queryByText(/^All /)).not.toBeInTheDocument();
    });

    it("gives a failure's reason as a sentence, as a warning", async () => {
      await render([failed(defaultAgent('golem'), 'The Harness is gone')]);

      expect(
        screen.getByText(/^Failed on/).closest('p, span, div'),
      ).toHaveTextContent(
        'Failed on golem, namespace kagent: The Harness is gone.',
      );
      expect(
        alertOf('General Assistant cannot start sessions'),
      ).toHaveAttribute('data-status', 'warning');
    });

    it('is info while it only waits for a model', async () => {
      await render([noModel(defaultAgent('golem'))]);

      expect(
        alertOf('General Assistant cannot start sessions'),
      ).toHaveAttribute('data-status', 'info');
    });

    it('sets the Models link in the size of the text around it', async () => {
      await render([noModel(defaultAgent('golem'))]);

      const models = screen.getByRole('link', { name: 'Models' });
      expect(models).toHaveAttribute('href', '/customize/models');
      expect(models).toHaveAttribute('data-variant', 'body-small');
    });
  });

  describe('for several agents', () => {
    const blocked = [
      noModel(defaultAgent('golem')),
      noModel(defaultAgent('lab', 'org-acme')),
      failed(defaultAgent('moon'), 'The Harness is gone'),
      noModel(defaultAgent('sun')),
    ];

    it('counts them in the title', async () => {
      await render(blocked);

      expect(
        screen.getByText('4 General Assistant agents cannot start sessions'),
      ).toBeInTheDocument();
    });

    it('calls agents of different names default agents', async () => {
      await render([
        noModel(defaultAgent('golem')),
        noModel(defaultAgent('lab', 'kagent', { name: 'Helper' })),
      ]);

      expect(
        screen.getByText('2 default agents cannot start sessions'),
      ).toBeInTheDocument();
    });

    it('groups them by reason, naming their environments, as a warning when one failed', async () => {
      await render(blocked);

      expect(
        screen.getByText(/^No model yet on/).closest('p, span, div'),
      ).toHaveTextContent(
        'No model yet on golem, lab, sun. Add one under Models.',
      );
      expect(
        screen.getByText('Failed on moon: The Harness is gone.'),
      ).toBeInTheDocument();
      expect(
        alertOf('4 General Assistant agents cannot start sessions'),
      ).toHaveAttribute('data-status', 'warning');
    });

    it('groups the environments that failed for one reason', async () => {
      await render([
        failed(defaultAgent('golem'), 'The Harness is gone'),
        failed(defaultAgent('lab'), 'The Harness is gone'),
      ]);

      expect(
        screen.getByText('Failed on golem, lab: The Harness is gone.'),
      ).toBeInTheDocument();
    });

    it('stops naming the reasons past two', async () => {
      await render([
        failed(defaultAgent('golem'), 'One.'),
        failed(defaultAgent('lab'), 'Two.'),
        failed(defaultAgent('moon')),
      ]);

      expect(
        screen.getByText(
          'Failed on golem, lab, moon, for different reasons that the list below names.',
        ),
      ).toBeInTheDocument();
    });

    it('lists every agent behind a disclosure, linked, with its reason', async () => {
      await render(blocked);

      expect(screen.queryByRole('list')).not.toBeInTheDocument();
      await userEvent.click(
        screen.getByRole('button', { name: 'All 4 agents' }),
      );

      const items = within(screen.getByRole('list')).getAllByRole('listitem');
      expect(items.map(item => item.textContent)).toEqual([
        'golem · kagent — No model yet.',
        'lab · org-acme — No model yet.',
        'moon · kagent — Failed: The Harness is gone.',
        'sun · kagent — No model yet.',
      ]);
      expect(
        within(items[1]).getByRole('link', { name: 'lab · org-acme' }),
      ).toHaveAttribute('href', '/customize/agents/lab/org-acme/default-agent');
    });
  });
});
