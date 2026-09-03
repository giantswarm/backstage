import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { AgentRow } from '../AgentsDataProvider';
import { MESSAGE_TEXT_MAX_LENGTH } from '../SessionComposer';
import { modelWarningFor, NewSessionComposer } from './NewSessionComposer';

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
// A second ready agent on gazelle, so a test can exercise a real choice without
// dragging in a second installation's group heading.
const issues = agentRow({
  id: 'gazelle/kagent/issue-tracker',
  name: 'Issue Tracker',
  technicalName: 'issue-tracker',
  description: 'Manages GitHub issues',
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
      // Two agents, because a sole agent is preselected — see the picker tests.
      renderComposer({ agents: [sre, issues] });

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

    it('starts on Enter', async () => {
      renderComposer({ defaultAgent: sre });

      await userEvent.type(field(), 'check the cluster{Enter}');

      expect(onStart).toHaveBeenCalledWith(sre, 'check the cluster');
    });

    it('still starts on Cmd/Ctrl+Enter, the key it used to be', async () => {
      renderComposer({ defaultAgent: sre });

      await userEvent.type(field(), 'check the cluster');
      await userEvent.keyboard('{Meta>}{Enter}{/Meta}');

      expect(onStart).toHaveBeenCalledWith(sre, 'check the cluster');
    });

    it('breaks the line on Shift+Enter', async () => {
      renderComposer({ defaultAgent: sre });

      await userEvent.type(field(), 'line one{Shift>}{Enter}{/Shift}line two');

      expect(onStart).not.toHaveBeenCalled();
      expect(field()).toHaveValue('line one\nline two');
    });

    it('does nothing on Enter without an agent to start — no newline either', async () => {
      // Two agents and no default, so nothing is preselected.
      renderComposer({ agents: [sre, issues] });

      await userEvent.type(field(), 'check the cluster{Enter}');

      expect(onStart).not.toHaveBeenCalled();
      expect(field()).toHaveValue('check the cluster');
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

    it('ignores a default that is not on offer', async () => {
      // A remembered agent can have been deleted, stopped being ready, or simply
      // not have arrived yet from a slower installation.
      renderComposer({ agents: [sre, issues], defaultAgent: platform });

      await userEvent.type(field(), 'check');

      expect(agentPicker()).toHaveTextContent('Select an agent');
      expect(startButton()).toBeDisabled();
    });

    it('falls back to a sole agent when the default is not on offer', async () => {
      // Otherwise this is a dead end: one agent available, none selected, and the
      // picker disabled because there is nothing to choose.
      renderComposer({ agents: [sre], defaultAgent: platform });

      await userEvent.type(field(), 'check');

      expect(agentPicker()).toHaveTextContent('SRE Agent');
      expect(startButton()).toBeEnabled();
    });

    it('bounds a description to one short line', async () => {
      // Descriptions are free text and a couple on gazelle run to several
      // sentences, which would push the other options off the screen.
      const chatty = agentRow({
        id: 'gazelle/kagent/chatty-agent',
        name: 'Chatty Agent',
        technicalName: 'chatty-agent',
        description: `First sentence.\nSecond one, at length: ${'x'.repeat(400)}`,
      });
      renderComposer({ agents: [sre, chatty] });

      await userEvent.click(agentPicker());

      const option = screen.getByRole('option', { name: /Chatty Agent/ });
      const description = option.textContent ?? '';
      expect(description.length).toBeLessThan(160);
      expect(description).not.toContain('\n');
      expect(description).toContain('…');
    });

    describe('a default that resolves after mount', () => {
      // The fleet-wide list resolves progressively: `useAgents().isLoading` goes
      // false as soon as the *first* installation answers, so a remembered agent on
      // a slower installation is routinely absent when the composer mounts.
      function rerenderWith(
        rerender: ReturnType<typeof renderComposer>['rerender'],
        props: Partial<Parameters<typeof NewSessionComposer>[0]>,
      ) {
        rerender(
          <NewSessionComposer
            agents={[sre]}
            isStarting={false}
            onStart={onStart}
            {...props}
          />,
        );
      }

      it('adopts it when it arrives, rather than ignoring it', () => {
        // Seeding `selectedId` only at mount left the picker saying "Select an
        // agent" whenever the remembered agent was not on the fastest installation
        // — defeating the whole point of remembering one.
        const { rerender } = renderComposer({
          agents: [],
          defaultAgent: undefined,
        });

        rerenderWith(rerender, { agents: [sre], defaultAgent: sre });

        expect(agentPicker()).toHaveTextContent('SRE Agent');
      });

      it('does not overwrite an agent the user already chose', async () => {
        renderComposer({ agents: [sre, platform] });
        await userEvent.click(agentPicker());
        await userEvent.click(
          screen.getByRole('option', { name: /Platform Agent/ }),
        );

        // A late-arriving default must lose to a deliberate choice.
        expect(agentPicker()).toHaveTextContent('Platform Agent');
      });

      it('does not undo a deliberate clearing', async () => {
        const { rerender } = renderComposer({
          agents: [sre],
          defaultAgent: sre,
        });
        expect(agentPicker()).toHaveTextContent('SRE Agent');

        // Touching the picker at all marks the selection as the user's, so a
        // re-resolved default cannot reinstate itself.
        await userEvent.click(agentPicker());
        await userEvent.keyboard('{Escape}');
        rerenderWith(rerender, { agents: [sre], defaultAgent: sre });

        expect(agentPicker()).toHaveTextContent('SRE Agent');
      });
    });

    it('omits a non-ready agent entirely', async () => {
      // A picker is for choosing, and an entry that cannot be chosen is noise in
      // it. Readiness and its reason live on the Agents tab and the agent's page.
      renderComposer({ agents: [sre, issues, broken] });

      await userEvent.click(agentPicker());

      expect(
        screen.queryByRole('option', { name: /Broken Agent/ }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole('option', { name: /Issue Tracker/ }),
      ).toBeInTheDocument();
    });

    it('never selects a non-ready agent, even as the only one on the fleet', async () => {
      // It must not be preselected into a Start that would fail at the first
      // message, and the picker must stay usable rather than disabled-and-empty.
      renderComposer({ agents: [broken] });

      await userEvent.type(field(), 'check');

      expect(agentPicker()).toHaveTextContent('Select an agent');
      expect(startButton()).toBeDisabled();
    });

    describe('a picker with nothing to choose', () => {
      it('preselects a sole agent and disables the control', () => {
        // A dropdown with a single item is not a choice. It still names the agent,
        // which is what confirms the target inside the agent-page dialog.
        renderComposer({ agents: [sre] });

        expect(agentPicker()).toHaveTextContent('SRE Agent');
        expect(agentPicker()).toBeDisabled();
      });

      it('stays enabled once there is a real choice', () => {
        renderComposer({ agents: [sre, issues] });

        expect(agentPicker()).toBeEnabled();
      });

      it('counts only startable agents when deciding that', () => {
        // Two agents but one non-ready is still no choice at all.
        renderComposer({ agents: [sre, broken] });

        expect(agentPicker()).toBeDisabled();
        expect(agentPicker()).toHaveTextContent('SRE Agent');
      });
    });

    it('groups by installation when the fleet has more than one', async () => {
      renderComposer({ agents: [sre, platform] });

      await userEvent.click(agentPicker());

      expect(screen.getByText('gazelle')).toBeInTheDocument();
      expect(screen.getByText('golem')).toBeInTheDocument();
    });

    it('does not repeat a single installation as a group heading', async () => {
      renderComposer({ agents: [sre, issues] });

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

describe('the model behind the agent', () => {
  const goneModel = agentRow({
    modelServing: {
      installation: 'gazelle',
      backend: 'ollama',
      readiness: 'notServing',
      name: 'qwen2.5:0.5b',
      message:
        'Ollama model qwen2.5:0.5b is not on the backend at 172.21.0.1 — deleted, or never pulled.',
    },
  });
  const failingModel = agentRow({
    modelServing: {
      installation: 'gazelle',
      backend: 'kserve',
      readiness: 'notReady',
      name: 'qwen3-14b',
      namespace: 'kserve',
      message: 'InferenceService qwen3-14b is not ready.',
    },
  });
  const idleModel = agentRow({
    modelServing: {
      installation: 'gazelle',
      backend: 'ollama',
      readiness: 'idle',
      name: 'qwen3:0.6b',
      message: 'Downloaded; not loaded.',
    },
  });

  it('warns — without blocking — when the selected agent’s model is not serving', async () => {
    // Collapsed on purpose: the warning is worth seeing before typing at it.
    renderComposer({ agents: [goneModel], collapsible: true });

    expect(
      screen.getByText("SRE Agent's model is not serving"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Ollama model qwen2\.5:0\.5b: .* You can still start the session/,
      ),
    ).toBeInTheDocument();

    await userEvent.type(field(), 'why is the ingress failing?');

    expect(startButton()).toBeEnabled();
  });

  it('warns when the model is failing', () => {
    renderComposer({ agents: [failingModel] });

    expect(
      screen.getByText("SRE Agent's model is not ready"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/InferenceService kserve\/qwen3-14b: /),
    ).toBeInTheDocument();
  });

  it('says nothing for an idle model — the first turn loads it', () => {
    renderComposer({ agents: [idleModel] });

    expect(screen.queryByText(/'s model is/)).not.toBeInTheDocument();
  });

  it('says nothing when the serving layer has no word on the model', () => {
    renderComposer({ agents: [sre] });

    expect(screen.queryByText(/'s model is/)).not.toBeInTheDocument();
  });

  it('is decided by modelWarningFor, which only flags the states an agent would hit', () => {
    expect(modelWarningFor(goneModel)).toBe(goneModel.modelServing);
    expect(modelWarningFor(failingModel)).toBe(failingModel.modelServing);
    expect(modelWarningFor(idleModel)).toBeUndefined();
    expect(modelWarningFor(sre)).toBeUndefined();
    expect(modelWarningFor(undefined)).toBeUndefined();
  });
});
