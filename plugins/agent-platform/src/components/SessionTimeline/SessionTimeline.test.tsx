import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { buildTimeline } from '../../lib/kagentTimeline';
import { normalizeTaskList } from '../../lib/kagentSessionDetail';
import { SessionTimeline } from './SessionTimeline';

import tasksV099 from '../../lib/__fixtures__/tasks.v0-9-9.json';
import tasksApproval from '../../lib/__fixtures__/tasks.approval.json';
import tasksAskUser from '../../lib/__fixtures__/tasks.ask-user.json';
import tasksAskUserPending from '../../lib/__fixtures__/tasks.ask-user-pending.json';
import tasksEmpty from '../../lib/__fixtures__/tasks.empty-no-data.json';

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
  it('renders the conversation', async () => {
    await render(tasksV099);

    expect(
      screen.getByText(/Which GitHub issues are assigned to me/),
    ).toBeInTheDocument();
    expect(screen.getByText(/You have two open issues/)).toBeInTheDocument();
  });

  it('labels the user and the resolved agent', async () => {
    await render(tasksV099);

    expect(screen.getAllByText('You').length).toBeGreaterThan(0);
    // The display name from the Agent CR, not the raw `issue_tracker` identifier.
    expect(screen.getAllByText('Issue tracker').length).toBeGreaterThan(0);
  });

  it('collapses the agent’s internal activity by default', async () => {
    // The working is why this screen is worth opening, but a wall of expanded tool
    // payloads is unreadable — so it starts collapsed and is one click away.
    //
    // Asserted on `aria-expanded`, not absence from the DOM: react-aria renders a
    // collapsed disclosure panel and hides it, so its text is present throughout.
    await render(tasksV099);

    expect(toolTrigger()).toHaveAttribute('aria-expanded', 'false');
    expect(panelFor(toolTrigger())).not.toBeVisible();
  });

  it('shows a tool call’s arguments and result when expanded', async () => {
    await render(tasksV099);

    await userEvent.click(toolTrigger());

    expect(toolTrigger()).toHaveAttribute('aria-expanded', 'true');
    const panel = panelFor(toolTrigger());
    expect(panel).toBeVisible();
    expect(panel).toHaveTextContent('Arguments');
    expect(panel).toHaveTextContent('Result');
  });

  it('expands everything when asked, and hides it when asked', async () => {
    await render(tasksV099);

    await userEvent.click(screen.getByRole('radio', { name: 'Expanded' }));
    expect(toolTrigger()).toHaveAttribute('aria-expanded', 'true');

    await userEvent.click(screen.getByRole('radio', { name: 'Hidden' }));
    expect(
      screen.queryByRole('button', { name: /github_search_issues/ }),
    ).not.toBeInTheDocument();
    // The conversation itself is never hidden — only the agent's working.
    expect(screen.getByText(/You have two open issues/)).toBeInTheDocument();
  });

  it('keeps an approval visible even when activity is hidden', async () => {
    // An approval records the *user's* decision, so hiding it would remove the
    // trace of their own action rather than the agent's working.
    //
    // The approval fixture on its own has no activity items — which is why the
    // control isn't offered for it at all — so the two timelines are combined here
    // to get a session that has both.
    const combined = timelineFor(tasksV099);
    const approval = timelineFor(tasksApproval);
    await renderInTestApp(
      <SessionTimeline
        timeline={{
          ...combined,
          items: [...combined.items, ...approval.items],
        }}
        agentName="Issue tracker"
      />,
    );

    await userEvent.click(screen.getByRole('radio', { name: 'Hidden' }));

    expect(
      screen.getByRole('button', { name: /Approval requested/ }),
    ).toBeInTheDocument();
    expect(screen.getByText('Approved')).toBeInTheDocument();
  });

  it('offers the control when the only collapsible entry is an approval', async () => {
    // This fixture has no reasoning, tool calls or delegations — just an approval.
    // Keying the control on *activity* left such sessions with a collapsed panel
    // and no way to open it, which is what happens on a real ask_user session.
    await render(tasksApproval);

    expect(
      screen.getByRole('radio', { name: 'Collapsed' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Expanded' })).toBeInTheDocument();
  });

  it('omits Hidden when there is no agent activity to hide', async () => {
    // `hidden` removes the agent's working, and an approval is not that — it is the
    // record of the user's own decision. With nothing else to hide, the option
    // would do nothing.
    await render(tasksApproval);

    expect(
      screen.queryByRole('radio', { name: 'Hidden' }),
    ).not.toBeInTheDocument();
  });

  it('expands an approval through the control', async () => {
    await render(tasksApproval);

    await userEvent.click(screen.getByRole('radio', { name: 'Expanded' }));

    expect(
      screen.getByRole('button', { name: /Approval requested/ }),
    ).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Proposed arguments')).toBeInTheDocument();
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

  it('offers no expander for an entry with nothing behind it', async () => {
    // The approval in this fixture carries proposed arguments, so it *is*
    // expandable. Strip them and it must render as a plain row: an accordion that
    // opens onto an empty panel invites a click and answers with nothing.
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

  it('shows an approval’s proposed arguments when it has them', async () => {
    await render(tasksApproval);

    const trigger = screen.getByRole('button', { name: /Approval requested/ });
    await userEvent.click(trigger);

    // Labelled "proposed", because these are arguments the agent asked to run —
    // not something it did.
    expect(screen.getByText('Proposed arguments')).toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('names a delegation and its token cost', async () => {
    await render(tasksV099);

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
      screen.getByText('Some messages could not be read'),
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
      screen.getByText('Some messages could not be read'),
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
