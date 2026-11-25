import { renderInTestApp } from '@backstage/frontend-test-utils';
import { TestApiProvider } from '@backstage/test-utils';
import { externalUrlConsentApiRef } from '@giantswarm/backstage-plugin-ui-react';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';

import type { PendingConfirmation } from '../../lib/kagentHitl';
import {
  URL_ELICITATION_CHANNEL,
  UrlElicitationPanel,
  useUrlElicitationReturn,
} from './UrlElicitationPanel';

const MUSTER = 'https://muster.gazelle.example.io';

/**
 * muster's answer to a tool call that asks (slice 2 of the tool-approval
 * plan), as kagent relays it to the page: a URL elicitation to muster's
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
/** The address the last *Open* asked the person to open. */
const openedUrl = (): string => consentOpen.mock.lastCall[0].url;
/** Where muster returns the browser to, as the link asks it to. */
const returnPage = (href: string): URL =>
  new URL(new URL(href).searchParams.get('redirect')!);

/** muster's return, as the tab it returned to tells the others. */
function returned(elicitationId: string) {
  act(() => {
    new FakeChannel(URL_ELICITATION_CHANNEL).postMessage({ elicitationId });
  });
}

async function renderPanel({
  pending = APPROVAL,
  musterOrigin = MUSTER,
  error,
  isAnswering = false,
}: {
  pending?: PendingConfirmation;
  musterOrigin?: string;
  error?: string;
  isAnswering?: boolean;
} = {}) {
  const onAnswer = jest.fn();
  const rendered = await renderInTestApp(
    <TestApiProvider apis={[[externalUrlConsentApiRef, { open: consentOpen }]]}>
      <UrlElicitationPanel
        pending={pending}
        isAnswering={isAnswering}
        error={error}
        onAnswer={onAnswer}
        musterOrigin={musterOrigin}
      />
    </TestApiProvider>,
    { initialRouteEntries: ['/sessions/gazelle/s1'] },
  );
  return { ...rendered, onAnswer };
}

const openButton = () =>
  screen.getByRole('button', { name: 'Open (opens in a new tab)' });

describe('UrlElicitationPanel', () => {
  let close: jest.SpyInstance;
  beforeEach(() => {
    FakeChannel.open = [];
    consentOpen.mockReset().mockResolvedValue('accept');
    window.sessionStorage.clear();
    (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel =
      FakeChannel;
    close = jest.spyOn(window, 'close').mockImplementation(() => {});
  });
  afterEach(() => {
    delete (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel;
    close.mockRestore();
  });

  it("shows muster's message as the heading, Open with the link's host, Done and Not now", async () => {
    await renderPanel();

    expect(
      screen.getByText(
        'Alert Review wants to acknowledge an incident in PagerDuty.',
      ),
    ).toBeInTheDocument();
    expect(openButton()).toBeInTheDocument();
    expect(screen.getByText('muster.gazelle.example.io')).toBeInTheDocument();
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
    expect(screen.getByText('muster.gazelle.example.io')).toBeInTheDocument();
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

  it("opens a link on muster's origin through the consent dialog, returning to this page with the elicitationId", async () => {
    const user = userEvent.setup();
    await renderPanel();

    await user.click(openButton());

    expect(consentOpen).toHaveBeenCalledWith({
      url: expect.any(String),
      requester: 'muster',
      message: 'Alert Review wants to acknowledge an incident in PagerDuty.',
    });
    const href = new URL(openedUrl());
    expect(`${href.origin}${href.pathname}`).toBe(`${MUSTER}/approvals/0f3c9a`);
    const back = returnPage(openedUrl());
    expect(back.origin).toBe(window.location.origin);
    expect(back.pathname).toBe('/sessions/gazelle/s1');
    expect(back.searchParams.get('elicitationId')).toBe('el-9b1d');
    // The return never carries a decision.
    expect([...back.searchParams.keys()]).toEqual(['elicitationId']);
  });

  it("resumes the agent on muster's return to the elicitation this tab opened, once", async () => {
    const user = userEvent.setup();
    const { onAnswer } = await renderPanel();

    await user.click(openButton());
    returned('el-9b1d');
    returned('el-9b1d');

    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer).toHaveBeenCalledWith({
      taskId: 'task-1',
      decision: 'approve',
      text: 'Done.',
      askedIn: 'status-1',
    });
  });

  it('resumes nothing on the return of another elicitation', async () => {
    const user = userEvent.setup();
    const { onAnswer } = await renderPanel();

    await user.click(openButton());
    returned('el-other');

    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('resumes nothing in a tab that did not open the page', async () => {
    const { onAnswer } = await renderPanel();

    returned('el-9b1d');

    expect(onAnswer).not.toHaveBeenCalled();
  });

  it('resumes nothing when the person did not open the page', async () => {
    consentOpen.mockResolvedValue('cancel');
    const user = userEvent.setup();
    const { onAnswer } = await renderPanel();

    await user.click(openButton());
    returned('el-9b1d');

    expect(onAnswer).not.toHaveBeenCalled();
  });

  it.each([
    ['on another origin', `https://approvals.example.org/approvals/0f3c9a`],
    [
      'on a look-alike host',
      `https://muster.gazelle.example.io.evil.example/x`,
    ],
  ])('opens a link %s as sent, without a return', async (_, url) => {
    const user = userEvent.setup();
    const { onAnswer } = await renderPanel({
      pending: {
        ...APPROVAL,
        elicitation: { ...APPROVAL.elicitation!, url },
      },
    });

    await user.click(openButton());
    returned('el-9b1d');

    expect(openedUrl()).toBe(url);
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it("opens the link as sent when muster's origin is not known", async () => {
    const user = userEvent.setup();
    await renderPanel({ musterOrigin: '' });

    await user.click(openButton());

    expect(openedUrl()).toBe(`${MUSTER}/approvals/0f3c9a`);
  });

  it('opens the link as sent without an elicitationId to come back with', async () => {
    const { elicitationId: _, ...elicitation } = APPROVAL.elicitation!;
    const user = userEvent.setup();
    await renderPanel({ pending: { ...APPROVAL, elicitation } });

    await user.click(openButton());

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

  it("tells the session's tabs which elicitation muster returned from, drops it from the address and closes", async () => {
    const heard = jest.fn();
    const listener = new FakeChannel(URL_ELICITATION_CHANNEL);
    listener.onmessage = event => heard(event.data);

    await renderInTestApp(<ReturnPage />, {
      initialRouteEntries: [
        '/sessions/gazelle/s1?tab=chat&elicitationId=el-9b1d',
      ],
    });

    expect(heard).toHaveBeenCalledWith({ elicitationId: 'el-9b1d' });
    await waitFor(() =>
      expect(screen.getByTestId('search')).toHaveTextContent('?tab=chat'),
    );
    expect(close).toHaveBeenCalled();
  });

  it('does nothing on a page muster did not return to', async () => {
    const heard = jest.fn();
    const listener = new FakeChannel(URL_ELICITATION_CHANNEL);
    listener.onmessage = event => heard(event.data);

    await renderInTestApp(<ReturnPage />, {
      initialRouteEntries: ['/sessions/gazelle/s1'],
    });

    expect(heard).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });
});
