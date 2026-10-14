import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  buildTimeline,
  SessionTimeline as Timeline,
  TimelineItem,
} from '../../lib/kagentTimeline';
import { normalizeTaskList } from '@giantswarm/backstage-plugin-agent-platform-common';
import { RECENT_TURNS, SessionTimeline } from './SessionTimeline';
import { TimelineEntry } from './TimelineEntry';

import {
  attachmentPngV2,
  tasksApproval,
  tasksAskUser,
  tasksAskUserPending,
  tasksEmptyNoData as tasksEmpty,
  tasksFailed,
  tasksRuntimeLost,
  tasksV099,
} from '@giantswarm/backstage-plugin-agent-platform-common/testFixtures';

function timelineFor(fixture: unknown) {
  return buildTimeline(normalizeTaskList(fixture).tasks);
}

async function render(
  fixture: unknown,
  agentName = 'Issue tracker',
  isAgentWorking = false,
) {
  await renderInTestApp(
    <SessionTimeline
      timeline={timelineFor(fixture)}
      agentName={agentName}
      isAgentWorking={isAgentWorking}
    />,
  );
}

/** The accordion trigger for the fixture's first tool call. */
function toolTrigger(): HTMLElement {
  return screen.getByRole('button', { name: /github_search_issues/ });
}

/** The fixture's first turn folds its two tool calls under one summary. */
function workSummary(): HTMLElement {
  return screen.getByRole('button', { name: /Used 2 tools/ });
}

/**
 * The disclosure panel a trigger controls, found through `aria-controls` — the
 * same association assistive tech follows.
 */
function panelFor(trigger: HTMLElement): HTMLElement {
  const id = trigger.getAttribute('aria-controls');
  const panel = id ? document.getElementById(id) : null;
  if (!(panel instanceof HTMLElement)) {
    throw new Error('no disclosure panel found for the trigger');
  }
  return panel;
}

describe('SessionTimeline', () => {
  // The technical-details preference persists through the StorageApi, which the
  // test app backs with localStorage — shared across tests in this file.
  beforeEach(() => window.localStorage.clear());

  it('renders the conversation', async () => {
    await render(tasksV099);

    expect(
      screen.getByText(/Which GitHub issues are assigned to me/),
    ).toBeInTheDocument();
    expect(screen.getByText(/You have two open issues/)).toBeInTheDocument();
  });

  it('captions only the first user message when the portal prepared it', async () => {
    const timeline = timelineFor(tasksV099);
    await renderInTestApp(
      <SessionTimeline
        timeline={timeline}
        agentName="Issue tracker"
        firstMessageCaption="Prepared by the portal"
      />,
    );

    const captions = screen.getAllByTestId('timeline-user-message-caption');
    expect(captions).toHaveLength(1);
    expect(captions[0]).toHaveTextContent('Prepared by the portal');
    expect(screen.getAllByTestId('timeline-user-message')[0]).toContainElement(
      captions[0],
    );
  });

  it('labels the user and the resolved agent', async () => {
    await render(tasksV099);

    expect(screen.getAllByText('You').length).toBeGreaterThan(0);
    // The display name from the Agent CR, not the raw `issue_tracker` identifier.
    expect(screen.getAllByText('Issue tracker').length).toBeGreaterThan(0);
  });

  it('folds a turn’s work into one summary line, collapsed once the turn is done', async () => {
    // The prototype's "✓ Used 3 tools ›": the turn's calls stand behind one
    // line, and the reply is what the reader sees first.
    await render(tasksV099);

    expect(workSummary()).toHaveAttribute('aria-expanded', 'false');
    // Folded means not mounted (T39): a long session's folded traces were most
    // of the page's DOM. The trigger points at no panel while there is none.
    expect(workSummary()).not.toHaveAttribute('aria-controls');
    expect(
      screen.queryByRole('button', { name: /github_search_issues/ }),
    ).not.toBeInTheDocument();
    // The conversation around the work stays where it was said.
    expect(screen.getByText(/You have two open issues/)).toBeVisible();
  });

  it('opens the summary straight onto the technical trace', async () => {
    // Clicking "Used N tools" is the decision to learn more, so there is no
    // second "show technical details" step: the exact names and the argument
    // summary are right there, each call folding out its payloads.
    await render(tasksV099);

    await userEvent.click(workSummary());

    expect(workSummary()).toHaveAttribute('aria-expanded', 'true');
    const work = panelFor(workSummary());
    expect(work).toBeVisible();
    expect(work).toHaveTextContent('2 steps · 2 tool calls');
    expect(toolTrigger()).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /technical details/i }),
    ).not.toBeInTheDocument();

    // Each call's payloads are its own fold-out — a wall of expanded payloads
    // is unreadable. Asserted on `aria-expanded`, not absence from the DOM: a
    // collapsed panel is rendered and hidden, so its text is present throughout.
    expect(toolTrigger()).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(toolTrigger());

    expect(toolTrigger()).toHaveAttribute('aria-expanded', 'true');
    const panel = panelFor(toolTrigger());
    expect(panel).toBeVisible();
    expect(panel).toHaveTextContent('Arguments');
    expect(panel).toHaveTextContent('Result');
  });

  it('folds the summary away again', async () => {
    await render(tasksV099);

    await userEvent.click(workSummary());
    await userEvent.click(workSummary());

    expect(workSummary()).toHaveAttribute('aria-expanded', 'false');
    // And unmounts the trace once the fold-away animation has run.
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: /github_search_issues/ }),
      ).not.toBeInTheDocument(),
    );
  });

  it('has no view-wide technical switch', async () => {
    // Technical detail is a fold-out in place, never a page-level toggle.
    await render(tasksV099);

    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.queryByText('Timeline')).not.toBeInTheDocument();
  });

  it('folds a lone call like many: summary, then a list of one, then its details', async () => {
    // T40: no lone-call special case. "Asked 1 agent" behaves exactly like
    // "Used 2 tools" — folded once the turn is done, opening onto the list.
    await render(tasksV099);

    const summary = screen.getByRole('button', { name: /Asked 1 agent/ });
    expect(summary).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.queryByRole('button', { name: /Delegated to sre-agent/ }),
    ).not.toBeInTheDocument();

    await userEvent.click(summary);

    expect(summary).toHaveAttribute('aria-expanded', 'true');
    expect(panelFor(summary)).toHaveTextContent('1 step · 1 tool call');
    const delegation = screen.getByRole('button', {
      name: /Delegated to sre-agent/,
    });
    expect(delegation).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(delegation);

    expect(delegation).toHaveAttribute('aria-expanded', 'true');
    expect(panelFor(delegation)).toBeVisible();
  });

  it('folds a lone skill load under "Loaded 1 skill", one click from its call', async () => {
    const base = timelineFor(tasksV099);
    const items: TimelineItem[] = [
      { kind: 'user-message', id: 'u', taskIndex: 0, text: 'Triage it' },
      {
        kind: 'tool-call',
        id: 's',
        taskIndex: 0,
        toolName: 'load_skill',
        args: { name: 'cluster-triage' },
        result: '# Cluster triage',
        isPending: false,
      },
      { kind: 'agent-message', id: 'm', taskIndex: 0, text: 'Done.' },
    ] as TimelineItem[];
    await renderInTestApp(
      <SessionTimeline timeline={{ ...base, items }} agentName="SRE" />,
    );

    const summary = screen.getByRole('button', { name: /Loaded 1 skill/ });
    expect(summary).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(summary);

    const call = screen.getByRole('button', { name: /load_skill/ });
    await userEvent.click(call);
    expect(panelFor(call)).toHaveTextContent('cluster-triage');
  });

  it('starts the summary open while the agent is still working on it', async () => {
    // Progress is what the reader is watching for; the run folds when the
    // turn ends.
    const timeline = timelineFor(tasksV099);
    const firstTurn = {
      ...timeline,
      items: timeline.items.filter(
        item => item.taskIndex === 0 && item.id !== '0:6:5',
      ),
    };
    await renderInTestApp(
      <SessionTimeline
        timeline={firstTurn}
        agentName="Issue tracker"
        isAgentWorking
      />,
    );

    expect(
      screen.getByRole('button', { name: /Used 2 tools/ }),
    ).toHaveAttribute('aria-expanded', 'true');
    // Open means mounted: the live run's calls are on the page as they land.
    expect(toolTrigger()).toBeVisible();
  });

  it('renders an approval readably, with its proposed call one fold-out away', async () => {
    await render(tasksApproval);

    // The proposed tool as words, and the user's decision.
    expect(screen.getByText('Approval requested')).toBeInTheDocument();
    expect(screen.getByText('Flux reconcile')).toBeInTheDocument();
    expect(screen.getByText('Approved')).toBeInTheDocument();
    // The raw payload is a disclosure on the row, collapsed.
    expect(
      screen.getByRole('button', { name: /Approval requested/ }),
    ).toHaveAttribute('aria-expanded', 'false');
  });

  describe('ask_user, which ADK wraps like an approval', () => {
    it('asks for input rather than approval', async () => {
      // Same `adk_request_confirmation` envelope as a permission request, but it
      // puts a question to the user — so "Approval requested" describes the wrong
      // thing. kagent's own UI branches at the same point.
      await render(tasksAskUser, 'SRE Agent');

      expect(screen.getByText('User input requested')).toBeInTheDocument();
      expect(screen.queryByText('Approval requested')).not.toBeInTheDocument();
    });

    it('reports that the user responded, not that they approved', async () => {
      // ADK records the reply as an "approve" decision, but "Approved" says nothing
      // about a question — the user simply answered it.
      await render(tasksAskUser, 'SRE Agent');

      expect(screen.getByText('Responded')).toBeInTheDocument();
      expect(screen.queryByText('Approved')).not.toBeInTheDocument();
    });

    it('shows the question as prose, with nothing to expand', async () => {
      // The question is the last thing the agent said, so it belongs in the
      // conversation rather than behind an expander as a JSON payload. With the
      // questions on the row there is nothing left to reveal, so the row offers
      // no expander at all.
      await render(tasksAskUser, 'SRE Agent');

      expect(
        screen.getByText('Which management cluster should I look at?'),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /User input requested/ }),
      ).not.toBeInTheDocument();
      // `ask_user` on every such row carries no information.
      expect(screen.queryByText('ask_user')).not.toBeInTheDocument();
    });

    it('shows a question the session is still waiting on', async () => {
      // The unanswered confirmation lives only on `task.status.message`, and the
      // raw `ask_user` call in history is skipped as ADK plumbing — so a session
      // ending in a question used to render as if the agent had stopped talking
      // mid-conversation.
      await render(tasksAskUserPending, 'SRE Agent');

      expect(
        screen.getByText(
          'What would you like to investigate next on the management cluster?',
        ),
      ).toBeInTheDocument();
      expect(screen.getByText('Awaiting a reply')).toBeInTheDocument();
    });

    it('shows what the user actually replied', async () => {
      // The reply rides on the same message as the `decision_type` data part.
      // Bailing out of that message discarded it, so the page showed the question
      // and the agent's follow-up with the user's words missing in between.
      await render(tasksAskUser, 'SRE Agent');

      expect(
        screen.getByText(/Still no reply to messages with image/),
      ).toBeInTheDocument();
    });

    it('reads the reply as conversation, in order', async () => {
      await render(tasksAskUser, 'SRE Agent');

      const order = [
        ...document.querySelectorAll('[data-testid^="timeline-"]'),
      ].map(el => el.getAttribute('data-testid'));
      expect(order).toEqual([
        'timeline-user-message',
        'timeline-approval',
        'timeline-user-message',
        'timeline-agent-message',
      ]);
    });

    it('does not show the reply twice, though the payload carries it twice', async () => {
      // It is in both the text part and `ask_user_answers`. The text part wins.
      await render(tasksAskUser, 'SRE Agent');

      expect(
        screen.getAllByText(/Still no reply to messages with image/),
      ).toHaveLength(1);
    });

    it('recovers the reply from ask_user_answers when there is no text part', async () => {
      // kagent's own UI reads only the structured field, so a session may exist
      // where it is the sole carrier — this one came through a Slack gateway that
      // writes both.
      const structuredOnly = structuredClone(
        tasksAskUser,
      ) as typeof tasksAskUser;
      const decision = structuredOnly.data[0].history.find(
        item => item.messageId === 'm-decision-1',
      ) as { parts: unknown[] };
      decision.parts = decision.parts.filter(
        part => (part as { kind?: string }).kind !== 'text',
      );

      await render(structuredOnly, 'SRE Agent');

      expect(
        screen.getByText(/Still no reply to messages with image/),
      ).toBeInTheDocument();
    });

    it('recovers the reply when the text part is present but blank', async () => {
      // A blank text part is not the user's words: the text run trims to nothing
      // and renders no message at all, so treating it as "there is text" skipped
      // the structured fallback and lost the reply entirely.
      const blankText = structuredClone(tasksAskUser) as typeof tasksAskUser;
      const decision = blankText.data[0].history.find(
        item => item.messageId === 'm-decision-1',
      ) as { parts: unknown[] };
      decision.parts = decision.parts.map(part =>
        (part as { kind?: string }).kind === 'text'
          ? { kind: 'text', text: '   ' }
          : part,
      );

      await render(blankText, 'SRE Agent');

      expect(
        screen.getByText(/Still no reply to messages with image/),
      ).toBeInTheDocument();
    });

    it('reports an unanswered question as awaiting a reply', async () => {
      const pending = structuredClone(tasksAskUser) as typeof tasksAskUser;
      pending.data[0].history = pending.data[0].history.filter(
        item => item.messageId !== 'm-decision-1',
      );

      await render(pending, 'SRE Agent');

      expect(screen.getByText('Awaiting a reply')).toBeInTheDocument();
    });
  });

  describe('a turn that failed', () => {
    it('shows why, under the agent’s name', async () => {
      // The reason lives only on the failed task's status.message. Before it was
      // read, this session rendered as two user messages with nothing under them.
      await render(tasksFailed, 'gpt6');

      expect(screen.getAllByText('This turn failed')).toHaveLength(2);
      expect(
        screen.getAllByText(/does not exist or you do not have access to it/),
      ).toHaveLength(2);
      expect(screen.getAllByText('gpt6').length).toBeGreaterThan(0);
    });

    it('is not trace, so there is nothing to fold away or expand', async () => {
      // A failed turn is the turn's outcome: always in view, never behind a
      // summary or an expander.
      await render(tasksFailed);

      expect(
        screen.queryByTestId('timeline-work-summary'),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /This turn failed/ }),
      ).not.toBeInTheDocument();
    });
  });

  it('offers no expander for an entry with nothing behind it', async () => {
    // The approval in this fixture carries proposed arguments, so in the
    // technical register it *is* expandable. Strip them and it must render as a
    // plain row even there: an accordion that opens onto an empty panel invites
    // a click and answers with nothing.
    const timeline = timelineFor(tasksApproval);
    const stripped = {
      ...timeline,
      items: timeline.items.map(item =>
        item.kind === 'approval' ? { ...item, args: undefined } : item,
      ),
    };

    await renderInTestApp(
      <SessionTimeline timeline={stripped} agentName="Issue tracker" />,
    );

    // Still shown, and still carries its verdict.
    expect(screen.getByText('Approval requested')).toBeInTheDocument();
    expect(screen.getByText('Approved')).toBeInTheDocument();
    // But not as something you can open.
    expect(
      screen.queryByRole('button', { name: /Approval requested/ }),
    ).not.toBeInTheDocument();
  });

  it('folds out an approval’s exact proposed call in place', async () => {
    await render(tasksApproval);

    const trigger = screen.getByRole('button', { name: /Approval requested/ });
    await userEvent.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const panel = panelFor(trigger);
    // The exact identifier the plain header put in words.
    expect(panel).toHaveTextContent('flux_reconcile');
    // Labelled "proposed", because these are arguments the agent asked to run —
    // not something it did.
    expect(panel).toHaveTextContent('Proposed arguments');
  });

  it('names a delegation and its token cost', async () => {
    await render(tasksV099);

    // The lone delegation folds under its summary (T40); the row is inside.
    await userEvent.click(
      screen.getByRole('button', { name: /Asked 1 agent/ }),
    );

    expect(screen.getByText('Delegated to sre-agent')).toBeInTheDocument();
    expect(screen.getByText('3.1k tokens')).toBeInTheDocument();
  });

  it('shows one absolute timestamp per turn, not per item', async () => {
    // A2A messages carry no time of their own and kagent's events cannot be
    // correlated with them, so a task's timestamp is the finest granularity there
    // is. Two turns in the fixture means two markers, not one per item.
    //
    // Absolute rather than relative, because every turn of a session usually falls
    // on the same day: the relative form printed "1 day ago" for both of these and
    // hid the four minutes between them.
    await render(tasksV099);

    const markers = screen.getAllByText(/UTC$/);
    expect(markers.map(m => m.textContent)).toEqual([
      '23 Jul 2026, 16:05 UTC',
      '23 Jul 2026, 16:09 UTC',
    ]);
    // Labelled, so the first one under the header's "Started …" does not read
    // as an unexplained second timestamp.
    expect(markers.map(m => m.parentElement?.textContent)).toEqual([
      'Turn 1 · 23 Jul 2026, 16:05 UTC',
      'Turn 2 · 23 Jul 2026, 16:09 UTC',
    ]);
  });

  describe('a stalled turn', () => {
    const since = Date.parse('2026-09-13T13:52:00Z');
    const clock = new Date(since).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });

    it('replaces the working row with when progress last came, and a cancel', async () => {
      const onCancelTurn = jest.fn();
      await renderInTestApp(
        <SessionTimeline
          timeline={timelineFor(tasksV099)}
          agentName="Issue tracker"
          // The page never passes both; if it did, the stall must win — a
          // spinner next to "no progress" contradicts itself.
          isAgentWorking
          stalledSince={since}
          onCancelTurn={onCancelTurn}
        />,
      );

      expect(screen.queryByText('Working…')).not.toBeInTheDocument();
      expect(
        screen.getByText(`The agent has not reported progress since ${clock}.`),
      ).toBeInTheDocument();

      await userEvent.click(
        screen.getByRole('button', { name: 'Stop the turn' }),
      );
      expect(onCancelTurn).toHaveBeenCalledTimes(1);
    });

    it('states the stall without a cancel when the turn is not known', async () => {
      await renderInTestApp(
        <SessionTimeline
          timeline={timelineFor(tasksV099)}
          agentName="Issue tracker"
          stalledSince={since}
        />,
      );

      expect(screen.getByText(/has not reported progress/)).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Stop the turn' }),
      ).not.toBeInTheDocument();
    });

    it('shows the stall on a session whose only message is the stalled one', async () => {
      // The reply to a session's first message has an empty conversation to
      // appear into — the stall row must not be lost with the empty state.
      await renderInTestApp(
        <SessionTimeline
          timeline={timelineFor(tasksEmpty)}
          agentName="Issue tracker"
          stalledSince={since}
          onCancelTurn={jest.fn()}
        />,
      );

      expect(screen.getByText(/has not reported progress/)).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Stop the turn' }),
      ).toBeInTheDocument();
    });
  });

  it('renders an empty state for a session that never ran', async () => {
    await render(tasksEmpty);

    expect(
      screen.getByText('This session has no messages yet.'),
    ).toBeInTheDocument();
    // No control to offer when there is no activity to govern.
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });

  it('warns when messages could not be read', async () => {
    const timeline = timelineFor(tasksV099);
    await renderInTestApp(
      <SessionTimeline
        timeline={{ ...timeline, skippedMessages: 2 }}
        agentName="Issue tracker"
      />,
    );

    expect(
      screen.getByText('Could not read some messages'),
    ).toBeInTheDocument();
    expect(screen.getByText(/2 messages/)).toBeInTheDocument();
  });

  it('warns when *every* message could not be read', async () => {
    // The case the warning exists for. A session whose entire history fails to
    // parse yields no items at all, so an empty-state early return would swallow
    // the warning and report total data loss as an ordinary empty session.
    await renderInTestApp(
      <SessionTimeline
        timeline={{
          items: [],
          tokens: { total: 0, prompt: 0, completion: 0 },
          skippedMessages: 3,
        }}
      />,
    );

    expect(
      screen.getByText('Could not read some messages'),
    ).toBeInTheDocument();
    expect(screen.getByText(/3 messages/)).toBeInTheDocument();
    // And it must not claim there were none.
    expect(
      screen.queryByText('This session has no messages yet.'),
    ).not.toBeInTheDocument();
  });

  it('renders every turn when a task index repeats non-contiguously', async () => {
    // `groupIntoTurns` deliberately groups on runs rather than on the index, so
    // this input produces two separate turns numbered 0. Both must render, and
    // must not collide: React would then be free to reconcile the second against
    // the first and render one turn's entries under the other's timestamp.
    const consoleError = jest.spyOn(console, 'error').mockImplementation();

    await renderInTestApp(
      <SessionTimeline
        timeline={{
          items: [
            {
              kind: 'user-message',
              id: '0:0:0',
              taskIndex: 0,
              at: '2026-07-23T16:05:00Z',
              text: 'first turn',
            },
            {
              kind: 'user-message',
              id: '1:0:1',
              taskIndex: 1,
              at: '2026-07-23T16:06:00Z',
              text: 'second turn',
            },
            {
              kind: 'user-message',
              id: '0:1:2',
              taskIndex: 0,
              at: '2026-07-23T16:07:00Z',
              text: 'back to the first index',
            },
          ],
          tokens: { total: 0, prompt: 0, completion: 0 },
          skippedMessages: 0,
        }}
      />,
    );

    expect(screen.getByText('first turn')).toBeInTheDocument();
    expect(screen.getByText('second turn')).toBeInTheDocument();
    expect(screen.getByText('back to the first index')).toBeInTheDocument();
    expect(screen.getAllByText(/UTC$/)).toHaveLength(3);

    // Filtered to the duplicate-key warning: rendering here also trips MUI v4's
    // pre-existing `findDOMNode` deprecation notice, which is not ours.
    const duplicateKeyWarnings = consoleError.mock.calls.filter(([first]) =>
      String(first).includes('same key'),
    );
    expect(duplicateKeyWarnings).toHaveLength(0);
    consoleError.mockRestore();
  });

  describe('the working indicator', () => {
    it('is absent unless the agent is working', async () => {
      await render(tasksV099);

      expect(screen.queryByText('Working…')).not.toBeInTheDocument();
    });

    it('ends the conversation with it while the agent works', async () => {
      // Where the reply will appear, which is the point: without it a sent
      // message sits there with nothing to say anything is happening.
      await render(tasksV099, 'Issue tracker', true);

      expect(screen.getByText('Working…')).toBeInTheDocument();
    });

    it('shows it on a session with no messages yet', async () => {
      // The reply to a session's first message has an empty conversation to
      // appear into, which is exactly when there is least other evidence.
      await render(tasksEmpty, 'Issue tracker', true);

      expect(
        screen.getByText('This session has no messages yet.'),
      ).toBeInTheDocument();
      expect(screen.getByText('Working…')).toBeInTheDocument();
    });
  });
});

describe('SessionTimeline — with tool activity hidden (S9)', () => {
  function timelineOf(items: TimelineItem[]): Timeline {
    return {
      items,
      tokens: { total: 0, prompt: 0, completion: 0 },
      skippedMessages: 0,
    };
  }

  const turn = [
    { kind: 'user-message', id: 'u', taskIndex: 0, text: 'Reconcile it' },
    { kind: 'reasoning', id: 'r', taskIndex: 0, text: 'Thinking it over' },
    {
      kind: 'tool-call',
      id: 't',
      taskIndex: 0,
      toolName: 'flux_reconcile',
      isPending: false,
    },
    {
      kind: 'agent-call',
      id: 'd',
      taskIndex: 0,
      agentId: 'sre_agent',
      isPending: false,
    },
    {
      kind: 'approval',
      id: 'a1',
      taskIndex: 0,
      asks: 'approval',
      toolName: 'flux_suspend',
      verdict: 'approved',
    },
    { kind: 'agent-message', id: 'm', taskIndex: 0, text: 'Reconciled.' },
  ] as TimelineItem[];

  it('leaves only the conversation', async () => {
    await renderInTestApp(
      <SessionTimeline
        timeline={timelineOf(turn)}
        agentName="SRE"
        showToolActivity={false}
      />,
    );

    expect(screen.getByText('Reconcile it')).toBeInTheDocument();
    expect(screen.getByText('Reconciled.')).toBeInTheDocument();
    expect(
      screen.queryByTestId('timeline-work-summary'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Reasoning')).not.toBeInTheDocument();
    // A permission already decided is how the work went, not conversation.
    expect(screen.queryByText('Approval requested')).not.toBeInTheDocument();
    // The agent still speaks under its name.
    expect(screen.getByText('SRE')).toBeInTheDocument();
  });

  it('shows everything when on, as before', async () => {
    await renderInTestApp(
      <SessionTimeline timeline={timelineOf(turn)} agentName="SRE" />,
    );

    expect(screen.getByTestId('timeline-work-summary')).toBeInTheDocument();
    expect(screen.getByText('Approval requested')).toBeInTheDocument();
  });

  const unanswered = {
    kind: 'approval',
    id: 'a2',
    taskIndex: 0,
    asks: 'approval',
    toolName: 'flux_suspend',
  } as TimelineItem;

  it('keeps the request the session waits on the person for', async () => {
    await renderInTestApp(
      <SessionTimeline
        timeline={timelineOf([turn[0], turn[2], unanswered])}
        agentName="SRE"
        showToolActivity={false}
        isAwaitingPerson
      />,
    );

    expect(screen.getByText('Approval requested')).toBeInTheDocument();
    expect(screen.getByText('Awaiting a decision')).toBeInTheDocument();
    expect(
      screen.queryByTestId('timeline-work-summary'),
    ).not.toBeInTheDocument();
  });

  it('hides an unanswered request the session no longer waits on', async () => {
    // A verdict in words the parser does not know, or a turn that failed or
    // was canceled after the request, leaves no verdict; it waits on nobody.
    await renderInTestApp(
      <SessionTimeline
        timeline={timelineOf([
          turn[0],
          unanswered,
          { kind: 'agent-message', id: 'm2', taskIndex: 0, text: 'Done.' },
        ] as TimelineItem[])}
        agentName="SRE"
        showToolActivity={false}
      />,
    );

    expect(screen.queryByText('Approval requested')).not.toBeInTheDocument();
    expect(screen.getByText('Done.')).toBeInTheDocument();
  });

  it('keeps only the newest unanswered request while the person is asked', async () => {
    await renderInTestApp(
      <SessionTimeline
        timeline={timelineOf([
          turn[0],
          { ...unanswered, id: 'stale' } as TimelineItem,
          { kind: 'user-message', id: 'u2', taskIndex: 1, text: 'Go on' },
          { ...unanswered, id: 'open', taskIndex: 1 } as TimelineItem,
        ] as TimelineItem[])}
        agentName="SRE"
        showToolActivity={false}
        isAwaitingPerson
      />,
    );

    expect(screen.getAllByText('Approval requested')).toHaveLength(1);
    expect(screen.getAllByTestId('timeline-approval')).toHaveLength(1);
  });

  it('leaves no marker over a turn of nothing but work', async () => {
    await renderInTestApp(
      <SessionTimeline
        timeline={timelineOf([
          turn[0],
          { ...turn[2], id: 't2', taskIndex: 1 } as TimelineItem,
          { kind: 'user-message', id: 'u3', taskIndex: 2, text: 'Thanks' },
        ] as TimelineItem[])}
        agentName="SRE"
        showToolActivity={false}
      />,
    );

    expect(screen.getByText(/^Turn 1/)).toBeInTheDocument();
    expect(screen.queryByText(/^Turn 2/)).not.toBeInTheDocument();
    // The turns around it keep their numbers.
    expect(screen.getByText(/^Turn 3/)).toBeInTheDocument();
  });

  it('keeps a question the person answered, so the reply answers something', async () => {
    await renderInTestApp(
      <SessionTimeline
        timeline={timelineFor(tasksAskUser)}
        agentName="SRE Agent"
        showToolActivity={false}
      />,
    );

    expect(
      screen.getByText('Which management cluster should I look at?'),
    ).toBeInTheDocument();
    expect(screen.getByText('Responded')).toBeInTheDocument();
  });

  it('keeps a pending question', async () => {
    await renderInTestApp(
      <SessionTimeline
        timeline={timelineFor(tasksAskUserPending)}
        agentName="SRE Agent"
        showToolActivity={false}
      />,
    );

    expect(screen.getByText('User input requested')).toBeInTheDocument();
    expect(screen.getByText('Awaiting a reply')).toBeInTheDocument();
  });

  it('names no agent over a turn whose agent side is all activity', async () => {
    await renderInTestApp(
      <SessionTimeline
        timeline={timelineOf(turn.slice(0, 4))}
        agentName="SRE"
        showToolActivity={false}
      />,
    );

    expect(screen.getByText('Reconcile it')).toBeInTheDocument();
    expect(screen.queryByText('SRE')).not.toBeInTheDocument();
  });

  it('still says the agent is working', async () => {
    await renderInTestApp(
      <SessionTimeline
        timeline={timelineOf([
          turn[0],
          { ...turn[2], isPending: true } as TimelineItem,
        ])}
        agentName="SRE"
        isAgentWorking
        showToolActivity={false}
      />,
    );

    expect(screen.getByText('Working…')).toBeInTheDocument();
    expect(
      screen.queryByTestId('timeline-work-summary'),
    ).not.toBeInTheDocument();
  });
});

describe('a lost stream', () => {
  it('says the result is being checked, in place of Working…', async () => {
    await renderInTestApp(
      <SessionTimeline
        timeline={timelineFor(tasksV099)}
        agentName="Issue tracker"
        isAgentWorking
        streamLost="checking"
      />,
    );

    expect(screen.queryByText('Working…')).not.toBeInTheDocument();
    expect(
      screen.getByText('The live stream was lost. Checking the result…'),
    ).toBeInTheDocument();
  });

  it('says the turn is followed without its preview', async () => {
    await renderInTestApp(
      <SessionTimeline
        timeline={timelineFor(tasksV099)}
        agentName="Issue tracker"
        isAgentWorking
        streamLost="following"
      />,
    );

    expect(screen.queryByText('Working…')).not.toBeInTheDocument();
    expect(
      screen.getByText(/The live stream was lost. Still working/),
    ).toBeInTheDocument();
  });

  it('says nothing about the stream when the agent is not working', async () => {
    // The row exists to describe a turn in progress; a finished turn has no
    // row, whatever became of its stream.
    await renderInTestApp(
      <SessionTimeline
        timeline={timelineFor(tasksV099)}
        agentName="Issue tracker"
        streamLost="following"
      />,
    );

    expect(screen.queryByText(/live stream was lost/)).not.toBeInTheDocument();
  });

  it('yields to a stall', async () => {
    // The page passes at most one of the two; if both arrive the stall wins,
    // as it does over the plain working row.
    await renderInTestApp(
      <SessionTimeline
        timeline={timelineFor(tasksV099)}
        agentName="Issue tracker"
        isAgentWorking
        streamLost="following"
        stalledSince={Date.parse('2026-09-13T13:52:00Z')}
      />,
    );

    expect(screen.queryByText(/live stream was lost/)).not.toBeInTheDocument();
    expect(screen.getByText(/has not reported progress/)).toBeInTheDocument();
  });
});

describe('SessionTimeline — a turn the runtime failed', () => {
  it('says the runtime could not be reached, in the portal’s words', async () => {
    // On gazelle the person read `actor "ai-…" request timed out` and nothing
    // else — an actor name and "timed out". The entry now says whose failure it
    // is and keeps the runtime's words as the evidence.
    await renderInTestApp(
      <SessionTimeline
        timeline={timelineFor(tasksRuntimeLost)}
        agentName="Grill master"
      />,
    );

    expect(
      screen.getAllByText('Could not reach the agent’s runtime'),
    ).toHaveLength(2);
    expect(
      screen.getAllByText(
        /could not bring the agent’s runtime back to answer this message/,
      ),
    ).toHaveLength(2);
    expect(
      screen.getAllByText(/The runtime said: actor "ai-01a09e86/),
    ).toHaveLength(2);
    expect(screen.queryByText('This turn failed')).not.toBeInTheDocument();
    for (const entry of screen.getAllByTestId('timeline-turn-failed')) {
      expect(entry).toHaveAttribute('data-runtime-lost', 'true');
    }
  });

  it('leaves the agent’s own failure worded as before', async () => {
    await renderInTestApp(
      <SessionTimeline timeline={timelineFor(tasksFailed)} agentName="gpt6" />,
    );

    expect(screen.getAllByText('This turn failed')).toHaveLength(2);
    for (const entry of screen.getAllByTestId('timeline-turn-failed')) {
      expect(entry).not.toHaveAttribute('data-runtime-lost');
    }
  });
});

describe('SessionTimeline — a turn the person canceled', () => {
  /** The shape a live session gave: the message, and nothing under it. */
  const canceledTasks = {
    data: [
      {
        id: 'task-canceled',
        status: { state: 'canceled', timestamp: '2026-09-18T05:56:07.729Z' },
        history: [
          {
            messageId: 'm-canceled-1',
            role: 'user',
            parts: [{ text: 'Could a node pool sit in another region?' }],
          },
        ],
      },
    ],
  };

  it('says the turn was stopped rather than leaving the message unanswered', async () => {
    await renderInTestApp(
      <SessionTimeline
        timeline={timelineFor(canceledTasks)}
        agentName="sre-agent"
      />,
    );

    expect(
      screen.getByText('Could a node pool sit in another region?'),
    ).toBeInTheDocument();
    expect(screen.getByText('This turn was canceled')).toBeInTheDocument();
  });

  it('says nothing about how far the turn got', async () => {
    // kagent keeps what a canceled turn had already streamed, as an artifact,
    // which `toWireTask` merges into the history — so the agent's half-written
    // reply is often directly above this entry. A line here about the turn having
    // been stopped "before the agent replied" contradicted what the reader could
    // see. Mirrors the captured fixture `task.canceled.kagent-4a91c273.json`.
    // In the API v2 shape, which is where artifacts exist at all: a v1 list is
    // discriminated by `tasks` rather than `data`, and only that path translates.
    const withPartialReply = {
      tasks: [
        {
          id: 'task-canceled',
          status: {
            state: 'TASK_STATE_CANCELED',
            timestamp: '2026-09-18T05:56:07.729Z',
          },
          history: [
            {
              messageId: 'm-canceled-1',
              role: 'ROLE_USER',
              parts: [{ text: 'Could a node pool sit in another region?' }],
              metadata: {
                'kagent.dev/timeline-position': '2026-09-18T05:56:03.078Z',
              },
            },
          ],
          artifacts: [
            {
              artifactId: 'a-partial',
              parts: [{ text: 'A node pool in another region is' }],
              metadata: {
                adk_author: 'sre-agent',
                'kagent.dev/timeline-position': '2026-09-18T05:56:05.011Z',
              },
            },
          ],
        },
      ],
    };
    await renderInTestApp(
      <SessionTimeline
        timeline={timelineFor(withPartialReply)}
        agentName="sre-agent"
      />,
    );

    expect(
      screen.getByText('A node pool in another region is'),
    ).toBeInTheDocument();
    expect(screen.getByText('This turn was canceled')).toBeInTheDocument();
    expect(screen.queryByText(/before the agent replied/)).toBeNull();
    expect(screen.queryByText(/recorded no reason/)).toBeNull();
  });

  it('does not dress a cancel up as a failure', async () => {
    // Stopping a turn that is taking too long is the ordinary way out of it, not
    // an error — and the runtime-lost notice keys off the failed entry, which a
    // cancel is not.
    await renderInTestApp(
      <SessionTimeline
        timeline={timelineFor(canceledTasks)}
        agentName="sre-agent"
      />,
    );

    expect(screen.queryByText('This turn failed')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('timeline-turn-failed'),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('timeline-turn-canceled')).toBeInTheDocument();
  });

  it('stays in view beside folded work — it is the turn’s outcome, not trace', async () => {
    // How the turn ended must never disappear behind a summary — otherwise the
    // page is back to a message that went unanswered for no visible reason.
    const working = timelineFor(tasksV099);
    const canceled = timelineFor(canceledTasks);
    await renderInTestApp(
      <SessionTimeline
        timeline={{
          ...working,
          items: [...working.items, ...canceled.items],
        }}
        agentName="sre-agent"
      />,
    );

    expect(screen.getByTestId('timeline-turn-canceled')).toBeVisible();
    expect(
      screen.getByRole('button', { name: /Used 2 tools/ }),
    ).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('SessionTimeline — an attached file', () => {
  // A real 1×1 PNG: the preview reads its header for the dimensions.
  const PNG_BYTES = (attachmentPngV2.part as { file: { bytes: string } }).file
    .bytes;

  function withAttachment(file: Record<string, unknown>) {
    return {
      data: [
        {
          id: 'task-1',
          status: { state: 'completed', timestamp: '2026-09-15T10:00:00Z' },
          history: [
            {
              kind: 'message',
              messageId: 'message-1',
              role: 'user',
              parts: [
                { kind: 'text', text: 'Look at this' },
                { kind: 'file', file },
              ],
            },
          ],
        },
      ],
    };
  }

  it('shows an image the bytes say is one', async () => {
    await render(
      withAttachment({
        name: 'shot.png',
        mimeType: 'image/png',
        bytes: PNG_BYTES,
      }),
    );

    const image = screen.getByRole('img', { name: 'shot.png' });
    expect(image).toHaveAttribute('src', `data:image/png;base64,${PNG_BYTES}`);
  });

  it('never renders an SVG as an image, even when it claims to be a PNG', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');

    await render(
      withAttachment({
        name: 'harmless.png',
        mimeType: 'image/png',
        bytes: svg.toString('base64'),
      }),
    );

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(
      screen.getByText(/only PNG, JPEG, GIF and WebP images are shown/),
    ).toBeInTheDocument();
  });

  it('says what it cannot show, rather than dropping it silently', async () => {
    await render(
      withAttachment({
        name: 'shot.png',
        mimeType: 'image/png',
        bytes: 'not base64!',
      }),
    );

    expect(screen.getByText('shot.png')).toBeInTheDocument();
    expect(screen.getByText(/contents could not be read/)).toBeInTheDocument();
    // Nothing to click: an untrusted file is not offered for download.
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('is conversation, so opening the work does not disturb it', async () => {
    // The file someone attached is part of what was said, not part of the
    // agent's trace — it never folds under a work summary.
    const conversation = timelineFor(tasksV099);
    const attachment = timelineFor(
      withAttachment({ name: 'shot.png', bytes: PNG_BYTES }),
    );
    await renderInTestApp(
      <SessionTimeline
        timeline={{
          ...conversation,
          items: [...conversation.items, ...attachment.items],
        }}
        agentName="Issue tracker"
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /Used 2 tools/ }));

    expect(screen.getByRole('img', { name: 'shot.png' })).toBeInTheDocument();
  });

  it('captions an image with the type its bytes carry, not the declared one', async () => {
    await render(
      withAttachment({
        name: 'shot.png',
        mimeType: 'application/octet-stream',
        bytes: PNG_BYTES,
      }),
    );

    const caption = screen.getByTestId('timeline-attachment');
    expect(caption).toHaveTextContent('image/png');
    expect(caption).not.toHaveTextContent('application/octet-stream');
  });

  it("marks the type on a file with no preview as the sender's claim", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');

    await render(
      withAttachment({
        name: 'harmless.png',
        mimeType: 'image/png',
        bytes: svg.toString('base64'),
      }),
    );

    expect(screen.getByText(/declared as image\/png/)).toBeInTheDocument();
  });

  it("keeps the user's file on the user's side and the agent's name on its reply", async () => {
    const fixture = withAttachment({ name: 'shot.png', bytes: PNG_BYTES });
    fixture.data[0].history.push({
      kind: 'message',
      messageId: 'message-2',
      role: 'agent',
      parts: [{ kind: 'text', text: 'That is a screenshot.' }],
    } as never);

    await render(fixture);

    const order = [
      ...document.querySelectorAll(
        '[data-testid^="timeline-"], [class*="authorHeader"]',
      ),
    ].map(el => el.getAttribute('data-testid') ?? 'agent-header');
    expect(order).toEqual([
      'timeline-user-message',
      'timeline-attachment',
      'agent-header',
      'timeline-agent-message',
    ]);
  });

  it('shows a file sent with an ask_user reply that has no text part', async () => {
    const structuredOnly = structuredClone(tasksAskUser) as typeof tasksAskUser;
    const decision = structuredOnly.data[0].history.find(
      item => item.messageId === 'm-decision-1',
    ) as { parts: unknown[] };
    decision.parts = [
      ...decision.parts.filter(
        part => (part as { kind?: string }).kind !== 'text',
      ),
      { kind: 'file', file: { name: 'shot.png', bytes: PNG_BYTES } },
    ];

    await render(structuredOnly, 'SRE Agent');

    expect(
      screen.getByText(/Still no reply to messages with image/),
    ).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'shot.png' })).toBeInTheDocument();
  });

  it('enlarges an image in the page and returns focus to it on close', async () => {
    await render(withAttachment({ name: 'shot.png', bytes: PNG_BYTES }));

    const enlarge = screen.getByRole('button', { name: 'Enlarge shot.png' });
    await userEvent.click(enlarge);

    const dialog = await screen.findByRole('dialog');
    const fullSize = within(dialog).getByRole('img', { name: 'shot.png' });
    expect(fullSize).toHaveAttribute(
      'src',
      `data:image/png;base64,${PNG_BYTES}`,
    );
    // Nothing leaves the page: no new tab, no download.
    expect(within(dialog).queryByRole('link')).not.toBeInTheDocument();
    // Focus stays inside while it is open.
    await userEvent.tab();
    await userEvent.tab();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);

    await userEvent.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(enlarge).toHaveFocus();

    await userEvent.click(enlarge);
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Close',
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(enlarge).toHaveFocus();
  });
});

describe('SessionTimeline — at 3 turns and at 300 (T39)', () => {
  /**
   * A session of `turnCount` turns, each a question, a run of two tool calls
   * folded under a summary, and a reply — the shape of a long agentic session.
   */
  function sessionOf(turnCount: number): Timeline {
    const items: TimelineItem[] = [];
    for (let turn = 0; turn < turnCount; turn++) {
      const at = new Date(
        Date.UTC(2026, 6, 23, 16, 0) + turn * 60_000,
      ).toISOString();
      const base = { at, taskIndex: turn };
      items.push(
        { ...base, kind: 'user-message', id: `${turn}:u`, text: `Q${turn}?` },
        {
          ...base,
          kind: 'tool-call',
          id: `${turn}:c1`,
          toolName: 'kubectl_get_pods',
          args: { namespace: 'default' },
          result: 'ok',
          isPending: false,
        },
        {
          ...base,
          kind: 'tool-call',
          id: `${turn}:c2`,
          toolName: 'kubectl_describe_pod',
          args: { name: 'web' },
          result: 'ok',
          isPending: false,
        },
        { ...base, kind: 'agent-message', id: `${turn}:a`, text: `A${turn}.` },
      );
    }
    return {
      items,
      tokens: { total: 0, prompt: 0, completion: 0 },
      skippedMessages: 0,
    };
  }

  const renderedTurns = () =>
    document.querySelectorAll('[data-turn-index]').length;

  it('renders a short session whole, with no paging chrome', async () => {
    await renderInTestApp(
      <SessionTimeline timeline={sessionOf(3)} agentName="sre-agent" />,
    );

    expect(renderedTurns()).toBe(3);
    expect(screen.getByText('Q0?')).toBeInTheDocument();
    expect(screen.getByText('A2.')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Show earlier activity/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('timeline-earlier-activity'),
    ).not.toBeInTheDocument();
    // Each turn's work is one folded line, its calls not mounted.
    expect(
      screen.getAllByRole('button', { name: /Used 2 tools/ }),
    ).toHaveLength(3);
    expect(
      screen.queryByRole('button', { name: /kubectl_get_pods/ }),
    ).not.toBeInTheDocument();
  });

  it('renders only the newest turns of a long session, and pages back on request', async () => {
    await renderInTestApp(
      <SessionTimeline timeline={sessionOf(300)} agentName="sre-agent" />,
    );

    // The newest RECENT_TURNS, ending at the latest reply.
    expect(renderedTurns()).toBe(RECENT_TURNS);
    expect(screen.getByText('A299.')).toBeInTheDocument();
    expect(screen.getByText(`Q${300 - RECENT_TURNS}?`)).toBeInTheDocument();
    expect(
      screen.queryByText(`Q${299 - RECENT_TURNS}?`),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Q0?')).not.toBeInTheDocument();
    // No folded trace is mounted: 600 tool calls, zero call rows.
    expect(
      screen.queryByRole('button', { name: /kubectl_get_pods/ }),
    ).not.toBeInTheDocument();

    // The control sits above the turns and says what it hides.
    const control = screen.getByTestId('timeline-earlier-activity');
    expect(control).toHaveTextContent(
      `${300 - RECENT_TURNS} earlier turns not shown`,
    );
    expect(
      control.compareDocumentPosition(
        document.querySelector('[data-turn-index]') as Node,
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    await userEvent.click(
      screen.getByRole('button', { name: 'Show earlier activity' }),
    );

    // One page more, not the whole history.
    expect(renderedTurns()).toBe(2 * RECENT_TURNS);
    expect(screen.getByText(`Q${300 - 2 * RECENT_TURNS}?`)).toBeInTheDocument();
    expect(screen.getByTestId('timeline-earlier-activity')).toHaveTextContent(
      `${300 - 2 * RECENT_TURNS} earlier turns not shown`,
    );
  });

  it('keeps the newest turn live when the window hides older ones', async () => {
    // The newest run is found by its place in the whole session, not in the
    // window, so a working agent's progress still starts open.
    const timeline = sessionOf(300);
    const working = {
      ...timeline,
      items: timeline.items.filter(item => item.id !== '299:a'),
    };
    await renderInTestApp(
      <SessionTimeline
        timeline={working}
        agentName="sre-agent"
        isAgentWorking
      />,
    );

    const summaries = screen.getAllByRole('button', { name: /Used 2 tools/ });
    expect(summaries).toHaveLength(RECENT_TURNS);
    expect(summaries[summaries.length - 1]).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(summaries[0]).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('TimelineEntry — the connector of a tool call (UX review M2)', () => {
  const call = {
    kind: 'tool-call',
    id: 'c',
    taskIndex: 0,
    toolName: 'x_agentlab-mcp-kubernetes_get_pods',
    args: { namespace: 'default' },
    result: 'ok',
    isPending: false,
    via: 'Muster',
  } as TimelineItem;
  const connectorOf = (name: string) =>
    name.startsWith('x_agentlab-mcp-kubernetes_')
      ? {
          connector: 'kubernetes',
          tool: name.slice('x_agentlab-mcp-kubernetes_'.length),
        }
      : undefined;

  it('names the connector as Customize does in a plain row, never the gateway', async () => {
    await renderInTestApp(
      <TimelineEntry item={call} connectorOf={connectorOf} />,
    );

    const row = screen.getByRole('button', { name: /Get pods/ });
    expect(row).toHaveTextContent('kubernetes');
    expect(row).not.toHaveTextContent('via Muster');
    expect(row).not.toHaveTextContent('agentlab-mcp');
  });

  it('keeps the exact name and the proxy in a technical row', async () => {
    await renderInTestApp(
      <TimelineEntry item={call} connectorOf={connectorOf} technical />,
    );

    const row = screen.getByRole('button', {
      name: /x_agentlab-mcp-kubernetes_get_pods/,
    });
    expect(row).toHaveTextContent('via Muster');
  });
});
