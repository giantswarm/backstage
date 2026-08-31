import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { AgentRow } from '../AgentsDataProvider';
import { MESSAGE_TEXT_MAX_LENGTH } from '../SessionComposer';
import { NewSessionComposer } from './NewSessionComposer';

const mockBuildAvatarUrl = jest.fn(
  (installation: string, name: string) =>
    `https://avatars.${installation}.example/v1/48/${name}.png`,
);
jest.mock('../../hooks/useAgentAvatarUrl', () => ({
  useAgentAvatarUrl: () => mockBuildAvatarUrl,
}));

const onStart = jest.fn();

function agentRow(overrides: Partial<AgentRow> = {}): AgentRow {
  return {
    id: 'gazelle/kagent/sre-agent',
    installation: 'gazelle',
    namespace: 'kagent',
    name: 'SRE Agent',
    technicalName: 'sre-agent',
    description: 'Investigates incidents',
    skillCount: 3,
    readiness: 'ready',
    ...overrides,
  };
}

const sre = agentRow();
const platform = agentRow({
  id: 'golem/kagent/platform-agent',
  installation: 'golem',
  name: 'Platform Agent',
  technicalName: 'platform-agent',
  description: 'Answers platform questions',
});
const broken = agentRow({
  id: 'gazelle/kagent/broken-agent',
  name: 'Broken Agent',
  technicalName: 'broken-agent',
  readiness: 'notReady',
  readinessMessage: '0/1 pods are ready',
});

function renderComposer(
  props: Partial<Parameters<typeof NewSessionComposer>[0]> = {},
) {
  return render(
    <NewSessionComposer
      agents={[sre]}
      isStarting={false}
      onStart={onStart}
      {...props}
    />,
  );
}

const field = () => screen.getByRole('textbox', { name: 'Prompt' });
const startButton = () => screen.getByRole('button', { name: 'Start' });
const agentPicker = () => screen.getByRole('button', { name: /Agent/ });

beforeEach(() => {
  onStart.mockReset();
});

describe('NewSessionComposer', () => {
  describe('collapsing', () => {
    it('shows only the prompt until it is focused', () => {
      renderComposer({ collapsible: true });

      expect(field()).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Start' }),
      ).not.toBeInTheDocument();
    });

    it('reveals the agent picker and Start on focus', async () => {
      renderComposer({ collapsible: true });

      await userEvent.click(field());

      expect(startButton()).toBeInTheDocument();
      expect(agentPicker()).toBeInTheDocument();
    });

    it('stays expanded after losing focus', async () => {
      // One-way on purpose: collapsing on blur would hide the agent just picked,
      // and re-collapsing under the cursor reads as a glitch.
      renderComposer({ collapsible: true });

      await userEvent.click(field());
      await userEvent.tab();

      expect(startButton()).toBeInTheDocument();
    });

    it('starts expanded when not collapsible, as the dialog uses it', () => {
      renderComposer();

      expect(startButton()).toBeInTheDocument();
    });
  });

  describe('what makes Start available', () => {
    it('is disabled with no prompt, even with an agent selected', () => {
      renderComposer({ defaultAgent: sre });

      expect(startButton()).toBeDisabled();
    });

    it('is disabled with a prompt but no agent selected', async () => {
      // Unlike the prototype there is no canonical default agent, and a wrong
      // guess starts a paid turn against something that can act on a cluster.
      renderComposer();

      await userEvent.type(field(), 'why is the ingress failing?');

      expect(startButton()).toBeDisabled();
    });

    it('is disabled for a prompt of pure whitespace', async () => {
      renderComposer({ defaultAgent: sre });

      await userEvent.type(field(), '   ');

      expect(startButton()).toBeDisabled();
    });

    it('is enabled once both are in hand', async () => {
      renderComposer({ defaultAgent: sre });

      await userEvent.type(field(), 'why is the ingress failing?');

      expect(startButton()).toBeEnabled();
    });

    it('is disabled while a create is in flight', () => {
      renderComposer({ defaultAgent: sre, isStarting: true });

      expect(screen.getByRole('button', { name: 'Starting…' })).toBeDisabled();
    });
  });

  describe('submitting', () => {
    it('hands over the chosen agent and the trimmed prompt', async () => {
      renderComposer({ defaultAgent: sre });

      await userEvent.type(field(), '  why is the ingress failing?  ');
      await userEvent.click(startButton());

      expect(onStart).toHaveBeenCalledWith(sre, 'why is the ingress failing?');
    });

    it('submits on Cmd/Ctrl+Enter', async () => {
      renderComposer({ defaultAgent: sre });

      await userEvent.type(field(), 'check the cluster');
      await userEvent.keyboard('{Meta>}{Enter}{/Meta}');

      expect(onStart).toHaveBeenCalledWith(sre, 'check the cluster');
    });

    it('leaves plain Enter to insert a newline', async () => {
      renderComposer({ defaultAgent: sre });

      await userEvent.type(field(), 'line one{Enter}line two');

      expect(onStart).not.toHaveBeenCalled();
      expect(field()).toHaveValue('line one\nline two');
    });

    it('keeps the prompt after submitting, so a failed create does not lose it', async () => {
      // The caller clears it by navigating away once the session exists.
      renderComposer({ defaultAgent: sre });

      await userEvent.type(field(), 'check the cluster');
      await userEvent.click(startButton());

      expect(field()).toHaveValue('check the cluster');
    });

    it('refuses a prompt over the message limit and says how long it is', async () => {
      renderComposer({ defaultAgent: sre });

      await userEvent.click(field());
      // Typing 32k characters is far too slow; paste instead.
      await userEvent.paste('x'.repeat(MESSAGE_TEXT_MAX_LENGTH + 1));

      expect(startButton()).toBeDisabled();
      expect(
        screen.getByText(
          `That prompt is ${MESSAGE_TEXT_MAX_LENGTH + 1} characters; the limit is ${MESSAGE_TEXT_MAX_LENGTH}.`,
        ),
      ).toBeInTheDocument();
    });
  });

  describe('the agent picker', () => {
    it('preselects the default agent', () => {
      renderComposer({ agents: [sre, platform], defaultAgent: platform });

      expect(agentPicker()).toHaveTextContent('Platform Agent');
    });

    it('asks for a choice when there is no default', () => {
      renderComposer({ agents: [sre, platform] });

      expect(agentPicker()).toHaveTextContent('Select an agent');
    });

    it('ignores a default that is not in the list', async () => {
      // A remembered agent can have been deleted since it was last used.
      renderComposer({ agents: [sre], defaultAgent: platform });

      await userEvent.type(field(), 'check');

      expect(startButton()).toBeDisabled();
    });

    it('bounds a description to one short line', async () => {
      // A `notAccepted` agent's readinessMessage is the controller's raw reconcile
      // error — a real one on gazelle is a 400-character multi-line Postgres dial
      // failure, which would push every other agent off the screen.
      const unwell = agentRow({
        id: 'gazelle/kagent/unwell-agent',
        name: 'Unwell Agent',
        technicalName: 'unwell-agent',
        readiness: 'notAccepted',
        readinessMessage: `failed to upsert agent:\n\tdial error: ${'x'.repeat(400)}`,
      });
      renderComposer({ agents: [sre, unwell] });

      await userEvent.click(agentPicker());

      const option = screen.getByRole('option', { name: /Unwell Agent/ });
      const description = option.textContent ?? '';
      expect(description.length).toBeLessThan(160);
      expect(description).not.toContain('\n');
      expect(description).toContain('Not accepted');
      expect(description).toContain('…');
    });

    it('offers a non-ready agent disabled, with the reason', async () => {
      // Shown rather than omitted: an agent missing from the list is
      // indistinguishable from one that never existed.
      renderComposer({ agents: [sre, broken] });

      await userEvent.click(agentPicker());

      const option = screen.getByRole('option', { name: /Broken Agent/ });
      expect(option).toHaveAttribute('aria-disabled', 'true');
      expect(option).toHaveTextContent('0/1 pods are ready');
    });

    it('groups by installation when the fleet has more than one', async () => {
      renderComposer({ agents: [sre, platform] });

      await userEvent.click(agentPicker());

      expect(screen.getByText('gazelle')).toBeInTheDocument();
      expect(screen.getByText('golem')).toBeInTheDocument();
    });

    it('does not repeat a single installation as a group heading', async () => {
      renderComposer({ agents: [sre, broken] });

      await userEvent.click(agentPicker());

      expect(screen.queryByText('gazelle')).not.toBeInTheDocument();
    });

    it('selects an agent from the list', async () => {
      renderComposer({ agents: [sre, platform] });

      await userEvent.click(agentPicker());
      await userEvent.click(screen.getByRole('option', { name: /SRE Agent/ }));
      await userEvent.type(field(), 'check');
      await userEvent.click(startButton());

      expect(onStart).toHaveBeenCalledWith(sre, 'check');
    });
  });

  it('says the fleet is still being read while installations respond', () => {
    renderComposer({ isLoadingAgents: true });

    expect(
      screen.getByText(
        'Still checking the remaining installations for agents…',
      ),
    ).toBeInTheDocument();
  });

  it('shows a failed create above the prompt', () => {
    renderComposer({ error: 'kagent did not accept the agent' });

    expect(screen.getByText('Session not started')).toBeInTheDocument();
    expect(
      screen.getByText('kagent did not accept the agent'),
    ).toBeInTheDocument();
  });
});
