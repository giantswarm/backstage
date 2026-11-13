import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { agentsRouteRef, modelsRouteRef } from '../../routes';
import type { AgentRow } from '../AgentsDataProvider';
import { DefaultAgentsBlockedAlert } from './DefaultAgentsBlockedAlert';
import {
  blockedDefaultAgents,
  type BlockedDefaultAgent,
} from './blockedDefaultAgents';

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

  it('reports a default agent without a model, whatever its readiness short of ready', () => {
    const failedOne = defaultAgent('golem');
    const pending = defaultAgent('lab', 'kagent', { readiness: 'pending' });
    const ready = defaultAgent('moon', 'kagent', { readiness: 'ready' });

    expect(
      blockedDefaultAgents(
        [failedOne, pending, ready],
        ids(failedOne, pending, ready),
      ),
    ).toEqual([noModel(failedOne), noModel(pending)]);
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
      blockedDefaultAgents([broken, converging], ids(broken, converging)),
    ).toEqual([failed(broken, 'Harness boot failed')]);
  });

  it('leaves out an agent that is not a default one', () => {
    expect(blockedDefaultAgents([defaultAgent('golem')], new Set())).toEqual(
      [],
    );
  });

  it('sorts by environment, then namespace', () => {
    const a = defaultAgent('lab', 'org-b');
    const b = defaultAgent('golem');
    const c = defaultAgent('lab', 'org-a');

    expect(
      blockedDefaultAgents([a, b, c], ids(a, b, c)).map(
        ({ agent }) => agent.id,
      ),
    ).toEqual([b.id, c.id, a.id]);
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

    it("gives a failure's reason", async () => {
      await render([failed(defaultAgent('golem'), 'The Harness is gone.')]);

      expect(
        screen.getByText(/^Failed on/).closest('p, span, div'),
      ).toHaveTextContent(
        'Failed on golem, namespace kagent: The Harness is gone.',
      );
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
      noModel(defaultAgent('lab')),
      noModel(defaultAgent('lab', 'org-acme')),
      failed(defaultAgent('moon'), 'The Harness is gone.'),
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

    it('groups them by reason, naming each environment once', async () => {
      await render(blocked);

      expect(
        screen.getByText(/^No model yet on/).closest('p, span, div'),
      ).toHaveTextContent('No model yet on golem, lab. Add one under Models.');
      expect(
        screen.getByText('Failed on moon: The Harness is gone.'),
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
        'lab · kagent — No model yet.',
        'lab · org-acme — No model yet.',
        'moon · kagent — Failed: The Harness is gone.',
      ]);
      expect(
        within(items[2]).getByRole('link', { name: 'lab · org-acme' }),
      ).toHaveAttribute('href', '/customize/agents/lab/org-acme/default-agent');
    });
  });
});
