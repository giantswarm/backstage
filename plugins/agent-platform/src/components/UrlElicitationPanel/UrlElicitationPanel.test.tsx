import { renderInTestApp } from '@backstage/frontend-test-utils';
import { mockApis, TestApiProvider } from '@backstage/test-utils';
import { identityApiRef } from '@backstage/core-plugin-api';
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
const PAGES = { origin: MUSTER, basePath: '' };
const PERSON = 'user:default/ada';

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
  route = '/sessions/gazelle/s1',
}: {
  pending?: PendingConfirmation;
  /** `null`: not known. */
  musterPages?: typeof PAGES | null;
  error?: string;
  isAnswering?: boolean;
  user?: string;
  route?: string;
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

  it("opens muster's approval page through the consent dialog, returning to this page with this open's value", async () => {
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
    // muster's approval page names the elicitation on its return; the
    // return never carries a decision.
    expect([...back.searchParams.keys()]).toEqual(['elicitationReturn']);
  });

  it("resumes the agent on muster's return to the open this tab made, once", async () => {
    const user = userEvent.setup();
    const { onAnswer } = await renderPanel();

    await user.click(openButton());
    const nonce = lastNonce();
    await returned('el-9b1d', nonce);
    await returned('el-9b1d', nonce);

    await waitFor(() => expect(onAnswer).toHaveBeenCalledTimes(1));
    expect(onAnswer).toHaveBeenCalledWith({
      taskId: 'task-1',
      decision: 'approve',
      text: 'Done.',
      askedIn: 'status-1',
    });
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
    const { onAnswer } = await renderPanel();

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
    const first = await renderPanel();
    await user.click(openButton());
    const nonce = lastNonce();
    first.unmount();

    const other = await renderPanel({ user: 'user:default/eve' });
    await returned('el-9b1d', nonce);
    other.unmount();
    const elsewhere = await renderPanel({ route: '/sessions/gazelle/s2' });
    await returned('el-9b1d', nonce);

    await new Promise(resolve => setTimeout(resolve, 0));
    expect(other.onAnswer).not.toHaveBeenCalled();
    expect(elsewhere.onAnswer).not.toHaveBeenCalled();
  });

  it('resumes nothing when the person did not open the page', async () => {
    consentOpen.mockResolvedValue('cancel');
    const user = userEvent.setup();
    const { onAnswer } = await renderPanel();

    await user.click(openButton());
    await returned('el-9b1d');

    await new Promise(resolve => setTimeout(resolve, 0));
    expect(onAnswer).not.toHaveBeenCalled();
  });

  // Security review M1-BS-S-03: a relayed link on muster's origin that is
  // not one of its returning pages opens as sent and resumes nothing.
  it.each([
    ['on another origin', `https://approvals.example.org/approvals/0f3c9a`],
    [
      'on a look-alike host',
      `https://muster.gazelle.example.io.evil.example/approvals/0f3c9a`,
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

    expect(openedUrl()).toBe(url);
    expect(window.sessionStorage.length).toBe(0);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it("opens the link as sent when muster's pages are not known", async () => {
    const user = userEvent.setup();
    await renderPanel({ musterPages: null });

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

  it("tells the session's tabs which elicitation and open muster returned from, drops both from the address and closes", async () => {
    const heard = jest.fn();
    const listener = new FakeChannel(URL_ELICITATION_CHANNEL);
    listener.onmessage = event => heard(event.data);

    await renderInTestApp(<ReturnPage />, {
      initialRouteEntries: [
        '/sessions/gazelle/s1?tab=chat&elicitationReturn=n-1&elicitationId=el-9b1d',
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
    ['muster did not return to', '/sessions/gazelle/s1'],
    [
      'that names an elicitation but no open',
      '/sessions/gazelle/s1?elicitationId=el-9b1d',
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
