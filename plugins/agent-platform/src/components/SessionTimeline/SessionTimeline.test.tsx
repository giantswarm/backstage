import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { buildTimeline } from '../../lib/kagentTimeline';
import { normalizeTaskList } from '../../lib/kagentSessionDetail';
import { SessionTimeline } from './SessionTimeline';

import tasksV099 from '../../lib/__fixtures__/tasks.v0-9-9.json';
import tasksApproval from '../../lib/__fixtures__/tasks.approval.json';
import tasksEmpty from '../../lib/__fixtures__/tasks.empty-no-data.json';

function timelineFor(fixture: unknown) {
  return buildTimeline(normalizeTaskList(fixture).tasks);
}

async function render(fixture: unknown, agentName = 'Issue tracker') {
  await renderInTestApp(
    <SessionTimeline timeline={timelineFor(fixture)} agentName={agentName} />,
  );
}

/** The accordion trigger for the fixture's first tool call. */
function toolTrigger(): HTMLElement {
  return screen.getByRole('button', { name: /github_search_issues/ });
}

/**
 * The disclosure panel a trigger controls.
 *
 * bui renders the panel as `role="group"` inside the same accordion, so it is
 * reached through the DOM rather than by an accessible name — the panel has none.
 */
function panelFor(trigger: HTMLElement): HTMLElement {
  // Scoped to the *group* container, not `[class*="bui-Accordion"]` — that also
  // matches the trigger's own `bui-AccordionTrigger`, so `closest` would return the
  // trigger and find no panel inside it. Each timeline entry renders its own
  // group, so the container holds exactly one panel.
  const panel = trigger
    .closest('[class*="AccordionGroup"]')
    ?.querySelector('[role="group"]');
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
    expect(screen.getByText('approved')).toBeInTheDocument();
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
});
