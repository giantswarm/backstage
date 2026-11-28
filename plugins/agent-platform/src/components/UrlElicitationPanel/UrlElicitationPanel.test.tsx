import { renderInTestApp } from '@backstage/frontend-test-utils';
import { mockApis, TestApiProvider } from '@backstage/test-utils';
import { identityApiRef } from '@backstage/core-plugin-api';
import { externalUrlConsentApiRef } from '@giantswarm/backstage-plugin-ui-react';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';

import type { PendingConfirmation } from '../../lib/kagentHitl';
import { URL_ELICITATION_STORAGE_KEY } from '../../lib/urlElicitationChannel';
import type { ApprovalView } from '@giantswarm/backstage-plugin-muster';
import type { InlineApprovals, SessionAgent } from '../InlineApproval';
import {
  ElicitationReturnNotice,
  URL_ELICITATION_CHANNEL,
  UrlElicitationPanel,
  useUrlElicitationReturn,
} from './UrlElicitationPanel';

const MUSTER = 'https://muster.example.example.io';
const PAGES = { origin: MUSTER, basePath: '' };
const PERSON = 'user:default/ada';

/**
 * muster's answer to a tool call that asks (tool approval), as kagent relays it to the page: a URL elicitation to muster's
 * approval page, with muster's elicitationId.
 */
const APPROVAL: PendingConfirmation = {
  taskId: 'task-1',
  asks: 'url',
  questions: [],
  elicitation: {
    id: 'call-7',
    server: 'muster',
    message: 'Alert Review wants to acknowledge an incident in PagerDuty.',
    url: `${MUSTER}/approvals/0f3c9a`,
    elicitationId: 'el-9b1d',
  },
  askedIn: 'status-1',
};

/** muster's sign-in, the other URL elicitation it sends today. */
const SIGN_IN: PendingConfirmation = {
  taskId: 'task-2',
  asks: 'url',
  questions: [],
  elicitation: {
    id: 'sign-in-1',
    server: 'muster',
    message: 'Sign in to github to continue.',
    url: `${MUSTER}/oauth/proxy/start?state=abc`,
    elicitationId: '5e1f0c',
  },
  askedIn: 'status-2',
};

/** BroadcastChannel between the tabs of one test, as a browser has it. */
class FakeChannel {
  static open: FakeChannel[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  constructor(readonly name: string) {
    FakeChannel.open.push(this);
  }
  postMessage(data: unknown) {
    for (const other of FakeChannel.open) {
      if (other !== this && other.name === this.name) {
        other.onmessage?.({ data } as MessageEvent);
      }
    }
  }
  close() {
    FakeChannel.open = FakeChannel.open.filter(entry => entry !== this);
  }
}

/** The person's answer in the external URL consent dialog. */
const consentOpen = jest.fn();
/** Where the new tab an *Open* of a muster page opened was sent. */
const tabGoesTo = jest.fn();
/** The tab `window.open` opened, `null` when the browser blocked it. */
let openedTab: { opener: unknown; location: { replace: jest.Mock } } | null;
/** The address the last *Open* opened: in a new tab, else in the dialog. */
const openedUrl = (): string =>
  tabGoesTo.mock.lastCall?.[0] ?? consentOpen.mock.lastCall[0].url;
/** Where muster returns the browser to, as the link asks it to. */
const returnPage = (href: string): URL =>
  new URL(new URL(href).searchParams.get('redirect')!);

/** The random value of the last open, as muster carries it back. */
const lastNonce = (): string =>
  returnPage(openedUrl()).searchParams.get('elicitationReturn')!;

/** muster's return, as the tab it returned to tells the others. */
async function returned(elicitationId: string, nonce = lastNonce()) {
  await act(async () => {
    new FakeChannel(URL_ELICITATION_CHANNEL).postMessage({
      elicitationId,
      nonce,
    });
  });
}

async function renderPanel({
  pending = APPROVAL,
  musterPages = PAGES,
  error,
  isAnswering = false,
  user = PERSON,
  route = '/sessions/example/s1',
  requestHandoff,
  approvals,
  sessionAgent,
}: {
  approvals?: InlineApprovals;
  sessionAgent?: SessionAgent;
  pending?: PendingConfirmation;
  /** `null`: not known. */
  musterPages?: typeof PAGES | null;
  error?: string;
  isAnswering?: boolean;
  user?: string;
  route?: string;
  requestHandoff?: (url: string) => Promise<string | undefined>;
} = {}) {
  const onAnswer = jest.fn();
  const rendered = await renderInTestApp(
    <TestApiProvider
      apis={[
        [externalUrlConsentApiRef, { open: consentOpen }],
        [identityApiRef, mockApis.identity({ userEntityRef: user })],
      ]}
    >
      <UrlElicitationPanel
        pending={pending}
        isAnswering={isAnswering}
        error={error}
        onAnswer={onAnswer}
        musterPages={musterPages ?? undefined}
        requestHandoff={requestHandoff}
        approvals={approvals}
        sessionAgent={sessionAgent}
      />
    </TestApiProvider>,
    { initialRouteEntries: [route] },
  );
  return { ...rendered, onAnswer };
}

const openButton = () =>
  screen.getByRole('button', { name: 'Open (opens in a new tab)' });

describe('UrlElicitationPanel', () => {
  let close: jest.SpyInstance;
  let windowOpen: jest.SpyInstance;
  beforeEach(() => {
    FakeChannel.open = [];
    consentOpen.mockReset().mockResolvedValue('accept');
    tabGoesTo.mockReset();
    openedTab = { opener: window, location: { replace: tabGoesTo } };
    windowOpen = jest
      .spyOn(window, 'open')
      .mockImplementation(() => openedTab as unknown as Window);
    window.sessionStorage.clear();
    (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel =
      FakeChannel;
    close = jest.spyOn(window, 'close').mockImplementation(() => {});
  });
  afterEach(() => {
    delete (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel;
    close.mockRestore();
    windowOpen.mockRestore();
  });

  it("shows muster's message as the heading, Open with the link's host, Done and Not now", async () => {
    await renderPanel();

    expect(
      screen.getByText(
        'Alert Review wants to acknowledge an incident in PagerDuty.',
      ),
    ).toBeInTheDocument();
    expect(openButton()).toBeInTheDocument();
    expect(screen.getByText('muster.example.example.io')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Not now' })).toBeInTheDocument();
    // Nothing sign-in or approval specific: the prompt is the same for all.
    expect(screen.queryByText(/sign in/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/approve/i)).not.toBeInTheDocument();
  });

  it('draws the sign-in the same way', async () => {
    await renderPanel({ pending: SIGN_IN });

    expect(
      screen.getByText('Sign in to github to continue.'),
    ).toBeInTheDocument();
    expect(openButton()).toBeInTheDocument();
    expect(screen.getByText('muster.example.example.io')).toBeInTheDocument();
  });

  it('names the server when it sent no message', async () => {
    const { message: _, ...elicitation } = APPROVAL.elicitation!;
    await renderPanel({ pending: { ...APPROVAL, elicitation } });

    expect(
      screen.getByText(
        'muster asks you to open a page so the agent can continue.',
      ),
    ).toBeInTheDocument();
  });

  it("opens muster's approval page at once in a new tab, without the consent dialog, as sent: no return, no handoff", async () => {
    const requestHandoff = jest.fn().mockResolvedValue('T1');
    const user = userEvent.setup();
    await renderPanel({ requestHandoff });

    await user.click(openButton());

    expect(consentOpen).not.toHaveBeenCalled();
    expect(windowOpen).toHaveBeenCalledWith('about:blank', '_blank');
    expect(openedTab!.opener).toBeNull();
    await waitFor(() => expect(tabGoesTo).toHaveBeenCalledTimes(1));
    expect(openedUrl()).toBe(`${MUSTER}/approvals/0f3c9a`);
    expect(requestHandoff).not.toHaveBeenCalled();
    expect(window.sessionStorage.length).toBe(0);
  });

  it("opens muster's sign-in start returning to this page with this open's value and the elicitation", async () => {
    const user = userEvent.setup();
    await renderPanel({ pending: SIGN_IN });

    await user.click(openButton());

    await waitFor(() => expect(tabGoesTo).toHaveBeenCalledTimes(1));
    const back = returnPage(openedUrl());
    expect(back.origin).toBe(window.location.origin);
    expect(back.pathname).toBe('/sessions/example/s1');
    expect([...back.searchParams.keys()].sort()).toEqual([
      'elicitationId',
      'elicitationReturn',
    ]);
  });

  it("resumes the agent on muster's return to the open this tab made, once", async () => {
    const user = userEvent.setup();
    const { onAnswer } = await renderPanel({ pending: SIGN_IN });

    await user.click(openButton());
    const nonce = lastNonce();
    await returned('5e1f0c', nonce);
    await returned('5e1f0c', nonce);

    await waitFor(() => expect(onAnswer).toHaveBeenCalledTimes(1));
    expect(onAnswer).toHaveBeenCalledWith({
      taskId: 'task-2',
      decision: 'approve',
      text: 'Done.',
      askedIn: 'status-2',
    });
  });

  it('resumes the agent on a storage event when there is no BroadcastChannel, once', async () => {
    const user = userEvent.setup();
    const { onAnswer } = await renderPanel({ pending: SIGN_IN });
    await user.click(openButton());
    const nonce = lastNonce();
    delete (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel;
    const send = async (n: string) =>
      act(async () => {
        window.dispatchEvent(
          new StorageEvent('storage', {
            key: URL_ELICITATION_STORAGE_KEY,
            newValue: JSON.stringify({ elicitationId: '5e1f0c', nonce: n }),
          }),
        );
      });
    await send('unknown-nonce');
    expect(onAnswer).not.toHaveBeenCalled();
    await send(nonce);
    await send(nonce);
    await waitFor(() => expect(onAnswer).toHaveBeenCalledTimes(1));
  });

  it('resumes the agent on the sign-in start, whose return the portal names', async () => {
    const user = userEvent.setup();
    const { onAnswer } = await renderPanel({ pending: SIGN_IN });

    await user.click(openButton());
    expect(returnPage(openedUrl()).searchParams.get('elicitationId')).toBe(
      '5e1f0c',
    );
    await returned('5e1f0c');

    await waitFor(() => expect(onAnswer).toHaveBeenCalledTimes(1));
  });

  // Security review M1-BS-S-01: a visit to the session page that names the
  // elicitation (its id travels in the session's messages) is no return.
  it.each([
    ['a guessed value', 'f'.repeat(32)],
    ['no value', ''],
  ])('resumes nothing on a return with %s', async (_, nonce) => {
    const user = userEvent.setup();
    const { onAnswer } = await renderPanel();

    await user.click(openButton());
    await returned('el-9b1d', nonce);

    await new Promise(resolve => setTimeout(resolve, 0));
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('resumes nothing on the return of another elicitation', async () => {
    const user = userEvent.setup();
    const { onAnswer } = await renderPanel({ pending: SIGN_IN });

    await user.click(openButton());
    await returned('el-other');

    await new Promise(resolve => setTimeout(resolve, 0));
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('resumes nothing in a tab that did not open the page', async () => {
    const { onAnswer } = await renderPanel();

    await returned('el-9b1d', 'a'.repeat(32));

    await new Promise(resolve => setTimeout(resolve, 0));
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('resumes nothing for another person or another session in this tab', async () => {
    const user = userEvent.setup();
    const first = await renderPanel({ pending: SIGN_IN });
    await user.click(openButton());
    const nonce = lastNonce();
    first.unmount();

    const other = await renderPanel({
      pending: SIGN_IN,
      user: 'user:default/eve',
    });
    await returned('5e1f0c', nonce);
    other.unmount();
    const elsewhere = await renderPanel({
      pending: SIGN_IN,
      route: '/sessions/example/s2',
    });
    await returned('5e1f0c', nonce);

    await new Promise(resolve => setTimeout(resolve, 0));
    expect(other.onAnswer).not.toHaveBeenCalled();
    expect(elsewhere.onAnswer).not.toHaveBeenCalled();
  });

  it("signs the sign-in start in with muster's handoff ticket, asked for that page", async () => {
    const requestHandoff = jest.fn().mockResolvedValue('T1');
    const user = userEvent.setup();
    await renderPanel({ pending: SIGN_IN, requestHandoff });

    await user.click(openButton());

    await waitFor(() => expect(tabGoesTo).toHaveBeenCalledTimes(1));
    expect(requestHandoff).toHaveBeenCalledWith(
      `${MUSTER}/oauth/proxy/start?state=abc`,
    );
    const href = new URL(openedUrl());
    expect(href.searchParams.get('handoff')).toBe('T1');
    expect(href.searchParams.get('redirect')).not.toBeNull();
  });

  it.each([
    ['muster issues none', async () => undefined],
    [
      'asking fails',
      async () => {
        throw new Error('down');
      },
    ],
  ])('opens the page without a ticket when %s', async (_, impl) => {
    const user = userEvent.setup();
    await renderPanel({
      pending: SIGN_IN,
      requestHandoff: jest.fn().mockImplementation(impl),
    });

    await user.click(openButton());

    await waitFor(() => expect(tabGoesTo).toHaveBeenCalledTimes(1));
    expect(new URL(openedUrl()).searchParams.has('handoff')).toBe(false);
  });

  it('falls back to the consent dialog, without a ticket, when the browser blocks the new tab', async () => {
    openedTab = null;
    const requestHandoff = jest.fn().mockResolvedValue('T1');
    const user = userEvent.setup();
    await renderPanel({ pending: SIGN_IN, requestHandoff });

    await user.click(openButton());

    await waitFor(() =>
      expect(consentOpen).toHaveBeenCalledWith({
        url: expect.any(String),
        requester: 'muster',
        message: 'Sign in to github to continue.',
      }),
    );
    expect(requestHandoff).not.toHaveBeenCalled();
    expect(new URL(openedUrl()).searchParams.has('handoff')).toBe(false);
  });

  it('resumes nothing when the person did not open the page', async () => {
    openedTab = null;
    consentOpen.mockResolvedValue('cancel');
    const user = userEvent.setup();
    const { onAnswer } = await renderPanel({ pending: SIGN_IN });

    await user.click(openButton());
    await returned('5e1f0c');

    await new Promise(resolve => setTimeout(resolve, 0));
    expect(onAnswer).not.toHaveBeenCalled();
  });

  // Security review M1-BS-S-03: a relayed link on muster's origin that is
  // not one of its returning pages opens as sent and resumes nothing.
  it.each([
    ['on another origin', `https://approvals.example.org/approvals/0f3c9a`],
    [
      'on a look-alike host',
      `https://muster.example.example.io.evil.example/approvals/0f3c9a`,
    ],
    ["on muster's origin, another path", `${MUSTER}/oauth/authorize?x=1`],
    ["on muster's origin, any page", `${MUSTER}/anything/else`],
  ])('opens a link %s as sent, without a return', async (_, url) => {
    const user = userEvent.setup();
    const { onAnswer } = await renderPanel({
      pending: {
        ...APPROVAL,
        elicitation: { ...APPROVAL.elicitation!, url },
      },
    });

    await user.click(openButton());
    await returned('el-9b1d', 'b'.repeat(32));

    expect(windowOpen).not.toHaveBeenCalled();
    expect(openedUrl()).toBe(url);
    expect(window.sessionStorage.length).toBe(0);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it("opens the link as sent when muster's pages are not known", async () => {
    const user = userEvent.setup();
    await renderPanel({ musterPages: null });

    await user.click(openButton());

    expect(windowOpen).not.toHaveBeenCalled();
    expect(openedUrl()).toBe(`${MUSTER}/approvals/0f3c9a`);
  });

  it('opens the link as sent without an elicitationId to come back with', async () => {
    const { elicitationId: _, ...elicitation } = APPROVAL.elicitation!;
    const user = userEvent.setup();
    await renderPanel({ pending: { ...APPROVAL, elicitation } });

    await user.click(openButton());

    await waitFor(() => expect(tabGoesTo).toHaveBeenCalledTimes(1));
    expect(openedUrl()).toBe(`${MUSTER}/approvals/0f3c9a`);
  });

  it('goes on with Done', async () => {
    const user = userEvent.setup();
    const { onAnswer } = await renderPanel();

    await user.click(screen.getByRole('button', { name: 'Done' }));

    expect(onAnswer).toHaveBeenLastCalledWith({
      taskId: 'task-1',
      decision: 'approve',
      text: 'Done.',
      askedIn: 'status-1',
    });
  });

  it('declines with Not now', async () => {
    const user = userEvent.setup();
    const { onAnswer } = await renderPanel();

    await user.click(screen.getByRole('button', { name: 'Not now' }));

    expect(onAnswer).toHaveBeenLastCalledWith({
      taskId: 'task-1',
      decision: 'reject',
      text: 'Not now.',
      askedIn: 'status-1',
    });
  });

  it('holds Done and Not now while an answer is under way', async () => {
    await renderPanel({ isAnswering: true });

    expect(screen.getByRole('button', { name: 'Done' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Not now' })).toBeDisabled();
  });

  it('shows an answer that was not taken', async () => {
    await renderPanel({ error: 'The agent is not waiting for a decision' });

    expect(
      screen.getByText('The agent is not waiting for a decision'),
    ).toBeInTheDocument();
  });
});

/** What muster's decision API shows of the approval APPROVAL links to. */
const VIEW: ApprovalView = {
  id: '0f3c9a',
  status: 'pending',
  heading: 'Approve this action?',
  message: 'An agent wants to run Acknowledge incident in PagerDuty.',
  tool: {
    title: 'Acknowledge incident',
    name: 'acknowledge_incident',
    exposed: 'x_pagerduty_acknowledge_incident',
    kind: 'tool',
  },
  connector: { displayName: 'PagerDuty', server: 'pagerduty' },
  changesData: true,
  arguments: [
    {
      key: 'incident',
      label: 'Incident',
      value: '"P1⟨U+202E⟩2"',
      type: 'string',
    },
    {
      key: 'note',
      label: 'Note',
      value: `"${'x'.repeat(300)}"`,
      type: 'string',
    },
  ],
  agentSays: 'It is a false alarm⟨U+200B⟩, closing it.',
  agent: { namespace: 'team-a', name: 'alert-review' },
  why: { setting: 'ask', source: 'connector' },
  actsFor: {
    name: 'ada@example.com',
    subject: 'ada',
    issuer: 'https://dex.example.io',
  },
  callerKind: 'actor JWT',
  installation: 'example',
  canonicalArguments: `{"incident":"P1⟨U+202E⟩2","note":"${'x'.repeat(300)}"}`,
  argumentsHash: 'a'.repeat(64),
  expiresAt: new Date(Date.now() + 4.5 * 60_000).toISOString(),
  digest: 'digest-1',
};

const SESSION_AGENT = { namespace: 'team-a', name: 'alert-review' };

function inlineApprovals(
  overrides: Partial<InlineApprovals> = {},
): InlineApprovals & { get: jest.Mock; decide: jest.Mock } {
  return {
    get: jest.fn().mockResolvedValue({ view: VIEW }),
    decide: jest.fn().mockResolvedValue({ status: 'approved' }),
    ...overrides,
  } as InlineApprovals & { get: jest.Mock; decide: jest.Mock };
}

describe('UrlElicitationPanel, approval decided inline', () => {
  let windowOpen: jest.SpyInstance;
  beforeEach(() => {
    consentOpen.mockReset().mockResolvedValue('accept');
    tabGoesTo.mockReset();
    openedTab = { opener: window, location: { replace: tabGoesTo } };
    windowOpen = jest
      .spyOn(window, 'open')
      .mockImplementation(() => openedTab as unknown as Window);
    window.sessionStorage.clear();
  });
  afterEach(() => windowOpen.mockRestore());

  const approveButton = () => screen.getByRole('button', { name: 'Approve' });
  const declineButton = () => screen.getByRole('button', { name: 'Decline' });

  /**
   * What a person does before deciding: opens every collapsed value, and
   * the buttons arm a second after the request is in view
   * (jsdom has no IntersectionObserver: the card counts as in view).
   */
  const readyToDecide = async (user: ReturnType<typeof userEvent.setup>) => {
    await screen.findByText('Approve this action?');
    for (const summary of screen
      .queryAllByTestId('approval-collapsed-value')
      .map(details => details.querySelector('summary')!)) {
      await user.click(summary);
    }
    await waitFor(() => expect(approveButton()).toBeEnabled(), {
      timeout: 3_000,
    });
  };

  it('shows everything the person needs to judge the request before Approve and Decline', async () => {
    const approvals = inlineApprovals();
    await renderPanel({ approvals, sessionAgent: SESSION_AGENT });

    expect(await screen.findByText('Approve this action?')).toBeInTheDocument();
    expect(approvals.get).toHaveBeenCalledWith(`${MUSTER}/approvals/0f3c9a`);
    // Connector: display name and server.
    expect(screen.getByTestId('approval-connector')).toHaveTextContent(
      'PagerDuty pagerduty',
    );
    // Tool: display name and raw name, and that it changes data.
    expect(screen.getByTestId('approval-tool')).toHaveTextContent(
      'Acknowledge incident acknowledge_incident',
    );
    expect(screen.getByText('Changes data')).toBeInTheDocument();
    // The full input as one block, with muster's marking of invisible
    // characters.
    const input = screen.getByTestId('approval-input');
    expect(input).toHaveTextContent('Input:');
    expect(input).toHaveTextContent('"incident": "P1⟨U+202E⟩2"');
    expect(input).toHaveTextContent(`"note": "${'x'.repeat(300)}"`);
    // The agent's reason, marked as its own words.
    const says = screen.getByTestId('approval-agent-says');
    expect(says).toHaveTextContent('Agent says');
    expect(says).toHaveTextContent('It is a false alarm⟨U+200B⟩, closing it.');
    expect(says).toHaveTextContent("The agent's own words");
    // Why it asks and when it expires.
    expect(screen.getByTestId('approval-why')).toHaveTextContent(
      "Asks because of the connector's setting for its tools · Expires in 4 min",
    );
    // The agent is the conversation's own: no warning. Who asks, as what
    // and for whom is behind Show details.
    expect(
      screen.queryByTestId('approval-other-agent'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('approval-unconfirmed-agent'),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('approval-about')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show details' }));
    expect(screen.getByTestId('approval-agent')).toHaveTextContent(
      'team-a/alert-review',
    );
    expect(screen.getByTestId('approval-caller-kind')).toHaveTextContent(
      'actor JWT',
    );
    expect(screen.getByTestId('approval-acts-for')).toHaveTextContent(
      'ada@example.com ada at https://dex.example.io',
    );
    // Approve and Decline come after all of it, inert at first; both arm
    // after the delay, collapsed values need not be opened.
    const details = screen.getByTestId('approval-details');
    const actions = screen.getByTestId('approval-actions');
    expect(
      details.compareDocumentPosition(actions) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(approveButton()).toBeDisabled();
    expect(declineButton()).toBeDisabled();
    await waitFor(() => expect(declineButton()).toBeEnabled(), {
      timeout: 3_000,
    });
    expect(approveButton()).toBeEnabled();
    // Muster's page stays a secondary way; Done is not needed here.
    expect(
      screen.getByRole('button', {
        name: 'Open in muster (opens in a new tab)',
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Done' }),
    ).not.toBeInTheDocument();
  });

  it('warns when another agent than the conversation’s asks', async () => {
    await renderPanel({
      approvals: inlineApprovals(),
      sessionAgent: { namespace: 'team-a', name: 'orchestrator' },
    });

    expect(await screen.findByTestId('approval-other-agent')).toHaveTextContent(
      'Asked by another agent, team-a/alert-review, not the agent of this conversation.',
    );
  });

  it('names the other agent by its display name, with the technical name beside it', async () => {
    await renderPanel({
      approvals: inlineApprovals({
        get: jest.fn().mockResolvedValue({
          view: {
            ...VIEW,
            agent: {
              namespace: 'team-a',
              name: 'alert-review',
              displayName: 'Alert Review',
            },
          },
        }),
      }),
      sessionAgent: { namespace: 'team-a', name: 'orchestrator' },
    });

    const warning = await screen.findByTestId('approval-other-agent');
    expect(warning).toHaveTextContent(
      'Asked by another agent, Alert Review (team-a/alert-review), not the agent of this conversation.',
    );
    expect(screen.getByTestId('approval-asker-name')).toHaveAttribute(
      'title',
      'team-a/alert-review',
    );
  });

  it('approves on the click with the digest of what is shown, and the chat goes on at once', async () => {
    const approvals = inlineApprovals();
    const user = userEvent.setup();
    const { onAnswer } = await renderPanel({
      approvals,
      sessionAgent: SESSION_AGENT,
    });

    await readyToDecide(user);
    await user.click(approveButton());

    expect(approvals.decide).toHaveBeenCalledWith(
      `${MUSTER}/approvals/0f3c9a`,
      'approve',
      'digest-1',
    );
    await waitFor(() =>
      expect(onAnswer).toHaveBeenCalledWith({
        taskId: 'task-1',
        decision: 'approve',
        text: 'Approved.',
        askedIn: 'status-1',
      }),
    );
    expect(onAnswer).toHaveBeenCalledTimes(1);
  });

  it('declines on the click, and the elicitation is declined', async () => {
    const approvals = inlineApprovals({
      decide: jest.fn().mockResolvedValue({ status: 'declined' }),
    });
    const user = userEvent.setup();
    const { onAnswer } = await renderPanel({ approvals });

    await readyToDecide(user);
    await user.click(declineButton());

    expect(approvals.decide).toHaveBeenCalledWith(
      `${MUSTER}/approvals/0f3c9a`,
      'decline',
      'digest-1',
    );
    await waitFor(() =>
      expect(onAnswer).toHaveBeenCalledWith({
        taskId: 'task-1',
        decision: 'reject',
        text: 'Declined.',
        askedIn: 'status-1',
      }),
    );
  });

  it('decides nothing without a click', async () => {
    const approvals = inlineApprovals();
    const { onAnswer } = await renderPanel({ approvals });
    await screen.findByText('Approve this action?');
    expect(approvals.decide).not.toHaveBeenCalled();
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it("shows muster's refusal of a decision and answers nothing", async () => {
    const approvals = inlineApprovals({
      decide: jest.fn().mockResolvedValue({
        refusal: {
          status: 503,
          error: 'unavailable',
          message: 'Approval is unavailable right now.',
        },
      }),
    });
    const user = userEvent.setup();
    const { onAnswer } = await renderPanel({ approvals });

    await readyToDecide(user);
    await user.click(approveButton());

    expect(await screen.findByText('Nothing was decided')).toBeInTheDocument();
    expect(
      screen.getByText('Approval is unavailable right now.'),
    ).toBeInTheDocument();
    expect(onAnswer).not.toHaveBeenCalled();
    expect(approveButton()).toBeEnabled();
  });

  it('shows the request again when it changed, and decides only the one shown then', async () => {
    const changed = {
      ...VIEW,
      digest: 'digest-2',
      arguments: [VIEW.arguments[0]],
      canonicalArguments: '{"incident":"P1⟨U+202E⟩2"}',
    };
    const approvals = inlineApprovals({
      get: jest
        .fn()
        .mockResolvedValueOnce({ view: VIEW })
        .mockResolvedValue({ view: changed }),
      decide: jest
        .fn()
        .mockResolvedValueOnce({
          refusal: {
            status: 409,
            error: 'changed',
            message: 'not the one shown',
          },
        })
        .mockResolvedValue({ status: 'approved' }),
    });
    const user = userEvent.setup();
    const { onAnswer } = await renderPanel({ approvals });

    await readyToDecide(user);
    await user.click(approveButton());

    expect(
      await screen.findByText(
        'The request is not the one shown before. Check it again before you decide.',
      ),
    ).toBeInTheDocument();
    expect(onAnswer).not.toHaveBeenCalled();
    expect(screen.getByTestId('approval-input')).not.toHaveTextContent(
      '"note"',
    );

    // Shown again, the request is armed anew before it can be approved.
    expect(approveButton()).toBeDisabled();
    await readyToDecide(user);
    await user.click(approveButton());
    expect(approvals.decide).toHaveBeenLastCalledWith(
      `${MUSTER}/approvals/0f3c9a`,
      'approve',
      'digest-2',
    );
    await waitFor(() => expect(onAnswer).toHaveBeenCalledTimes(1));
  });

  it("says when the request is someone else's, offers no Approve, and keeps muster's page", async () => {
    const approvals = inlineApprovals({
      get: jest.fn().mockResolvedValue({
        refusal: {
          status: 403,
          error: 'foreign',
          message:
            'This request was made for someone else; only they can decide it.',
        },
      }),
    });
    await renderPanel({ approvals });

    expect(
      await screen.findByText('This request is someone else’s'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'This request was made for someone else; only they can decide it.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Approve' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
  });

  it('goes on with what stands when the request was decided meanwhile on muster’s page', async () => {
    const approvals = inlineApprovals({
      decide: jest.fn().mockResolvedValue({
        refusal: {
          status: 409,
          error: 'decided',
          decided: 'declined',
          message: 'x',
        },
      }),
    });
    const user = userEvent.setup();
    const { onAnswer } = await renderPanel({ approvals });

    await readyToDecide(user);
    await user.click(approveButton());

    await waitFor(() =>
      expect(onAnswer).toHaveBeenCalledWith(
        expect.objectContaining({ decision: 'reject', text: 'Declined.' }),
      ),
    );
  });

  it("opens muster's page as a secondary way, and offers Done when muster shows nothing here", async () => {
    const approvals = inlineApprovals({
      get: jest.fn().mockResolvedValue({
        refusal: {
          status: 403,
          error: 'untrusted_client',
          message: 'This client may not decide approvals.',
        },
      }),
    });
    const user = userEvent.setup();
    const { onAnswer } = await renderPanel({ approvals });

    expect(
      await screen.findByText('The request can’t be shown here'),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', {
        name: 'Open in muster (opens in a new tab)',
      }),
    );
    await waitFor(() =>
      expect(tabGoesTo).toHaveBeenCalledWith(`${MUSTER}/approvals/0f3c9a`),
    );
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(onAnswer).toHaveBeenLastCalledWith(
      expect.objectContaining({ decision: 'approve', text: 'Done.' }),
    );
  });

  it('keeps the sign-in start on the tab and return flow', async () => {
    const approvals = inlineApprovals();
    await renderPanel({ pending: SIGN_IN, approvals });
    expect(openButton()).toBeInTheDocument();
    expect(approvals.get).not.toHaveBeenCalled();
  });
});

describe('useUrlElicitationReturn', () => {
  let close: jest.SpyInstance;
  beforeEach(() => {
    FakeChannel.open = [];
    (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel =
      FakeChannel;
    close = jest.spyOn(window, 'close').mockImplementation(() => {});
  });
  afterEach(() => {
    delete (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel;
    close.mockRestore();
  });

  function ReturnPage() {
    useUrlElicitationReturn();
    const { search } = useLocation();
    return <span data-testid="search">{search}</span>;
  }

  it("tells the session's tabs which elicitation and open muster returned from, drops both from the address and closes", async () => {
    const heard = jest.fn();
    const listener = new FakeChannel(URL_ELICITATION_CHANNEL);
    listener.onmessage = event => heard(event.data);

    await renderInTestApp(<ReturnPage />, {
      initialRouteEntries: [
        '/sessions/example/s1?tab=chat&elicitationReturn=n-1&elicitationId=el-9b1d',
      ],
    });

    expect(heard).toHaveBeenCalledWith({
      elicitationId: 'el-9b1d',
      nonce: 'n-1',
    });
    await waitFor(() =>
      expect(screen.getByTestId('search')).toHaveTextContent('?tab=chat'),
    );
    expect(close).toHaveBeenCalled();
  });

  it.each([
    ['muster did not return to', '/sessions/example/s1'],
    [
      'that names an elicitation but no open',
      '/sessions/example/s1?elicitationId=el-9b1d',
    ],
  ])('does nothing on a page %s', async (_, route) => {
    const heard = jest.fn();
    const listener = new FakeChannel(URL_ELICITATION_CHANNEL);
    listener.onmessage = event => heard(event.data);

    await renderInTestApp(<ReturnPage />, { initialRouteEntries: [route] });

    expect(heard).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });
});

describe('return notice and storage fallback', () => {
  let close: jest.SpyInstance;
  beforeEach(() => {
    delete (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel;
    close = jest.spyOn(window, 'close').mockImplementation(() => {});
    window.sessionStorage.clear();
  });
  afterEach(() => close.mockRestore());

  function ReturnPage() {
    const isReturn = useUrlElicitationReturn();
    return isReturn ? <ElicitationReturnNotice /> : <span>chat</span>;
  }

  it('shows the return tab that it may be closed', async () => {
    await renderInTestApp(<ReturnPage />, {
      initialRouteEntries: ['/s?elicitationReturn=n-1&elicitationId=el-1'],
    });
    expect(
      await screen.findByText('Done — you can close this tab'),
    ).toBeInTheDocument();
    expect(close).toHaveBeenCalled();
  });

  it('shows the chat on a visit that is no return', async () => {
    await renderInTestApp(<ReturnPage />, { initialRouteEntries: ['/s'] });
    expect(screen.getByText('chat')).toBeInTheDocument();
    expect(close).not.toHaveBeenCalled();
  });
});
