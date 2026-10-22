import { renderInTestApp } from '@backstage/frontend-test-utils';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { ConfirmationAnswer } from '../../hooks/useAnswerConfirmation';
import { SIGN_IN_RETURN_PARAM } from '../../lib/connectorSignIn';
import type { PendingConfirmation } from '../../lib/kagentHitl';
import type { TimelineItem } from '../../lib/kagentTimeline';
import { connectorLabels, type ServerInfo } from '../../lib/toolset';
import { MessageMarkdown } from '../SessionTimeline/MessageMarkdown';
import { ConnectorSignInLinks } from './ConnectorSignInLinks';

const LINK = 'https://muster.example.com/oauth/proxy/start?state=abc123';
const CHANNEL = 'giantswarm.agent-platform.connector-sign-in';

const SERVERS: ServerInfo[] = [
  {
    name: 'grafana-cloud',
    group: 'registered',
    toolNamePrefix: 'x_grafana-cloud',
    oauth: true,
    signInTool: true,
    displayName: 'Grafana Cloud',
  },
];

/** muster's answer to the agent's `core_auth_login`. */
function login(at?: string): TimelineItem {
  return {
    kind: 'tool-call',
    id: 'c1',
    taskIndex: 0,
    ...(at && { at }),
    toolName: 'core_auth_login',
    via: 'Muster',
    args: { server: 'grafana-cloud' },
    result: {
      content: [
        `Authentication Required\n\nServer: grafana-cloud\n\nPlease sign in to connect to this server:\n\n${LINK}\n\nAfter signing in, run this tool again.`,
      ],
      structuredContent: { authUrl: LINK },
    },
    isPending: false,
  };
}

/** The question the agent asked in the UX test, with the link in it. */
const QUESTION: PendingConfirmation = {
  taskId: 'task-1',
  asks: 'input',
  questions: [
    {
      question: `Please sign in to Grafana Cloud: ${LINK}`,
      choices: ["I've signed in", "I can't sign in right now"],
      multiple: false,
    },
  ],
  askedIn: 'status-1',
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

function Session({
  text,
  pending,
  onAnswer,
  items,
}: {
  text: string;
  pending?: PendingConfirmation;
  onAnswer: (answer: ConfirmationAnswer) => void;
  items: TimelineItem[];
}) {
  return (
    <ConnectorSignInLinks
      items={items}
      servers={SERVERS}
      labels={connectorLabels(SERVERS)}
      pending={pending}
      onAnswer={onAnswer}
    >
      <MessageMarkdown text={text} />
    </ConnectorSignInLinks>
  );
}

async function renderSession({
  text = `Sign in here: ${LINK}`,
  pending,
  onAnswer = jest.fn(),
  path = '/sessions/gazelle/s1',
  items = [login()],
}: {
  text?: string;
  pending?: PendingConfirmation;
  onAnswer?: jest.Mock;
  path?: string;
  items?: TimelineItem[];
} = {}) {
  const rendered = await renderInTestApp(
    <Session text={text} pending={pending} onAnswer={onAnswer} items={items} />,
    { initialRouteEntries: [path] },
  );
  return { ...rendered, onAnswer };
}

const signInLink = () =>
  screen.getByRole('link', { name: 'Sign in to Grafana Cloud ↗' });
const queryDone = () => screen.queryByText('Signed in to Grafana Cloud');

/** What muster returns the sign-in's tab to, as the link asks it to. */
function returnPage(href: string): URL {
  return new URL(new URL(href).searchParams.get('redirect')!);
}

/** The return tab's word, as it posts it after muster's callback. */
function returned(href: string, server: string | null = 'grafana-cloud') {
  const id = returnPage(href).searchParams.get(SIGN_IN_RETURN_PARAM);
  act(() => {
    new FakeChannel(CHANNEL).postMessage(
      server === null ? { id } : { id, server },
    );
  });
}

describe('ConnectorSignInLinks', () => {
  let close: jest.SpyInstance;
  beforeEach(() => {
    FakeChannel.open = [];
    window.sessionStorage.clear();
    (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel =
      FakeChannel;
    close = jest.spyOn(window, 'close').mockImplementation(() => {});
  });
  afterEach(() => {
    delete (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel;
    close.mockRestore();
    jest.useRealTimers();
  });

  it('shows a sign-in muster issued as an action naming the connector, never the URL', async () => {
    await renderSession();

    const link = signInLink();
    expect(link).toHaveAttribute('target', '_blank');
    expect(new URL(link.getAttribute('href')!).searchParams.get('state')).toBe(
      'abc123',
    );
    expect(returnPage(link.getAttribute('href')!).pathname).toBe(
      '/sessions/gazelle/s1',
    );
    expect(screen.queryByText(LINK)).not.toBeInTheDocument();
  });

  it('leaves a link muster did not issue in this session as a link', async () => {
    const other = 'https://muster.example.com/oauth/proxy/start?state=other';
    await renderSession({ text: `Try [this](${other}) or ${LINK}.` });

    expect(screen.getByRole('link', { name: /^this/ })).toHaveAttribute(
      'href',
      other,
    );
    expect(signInLink()).toBeInTheDocument();
  });

  it('waits once started, and is done when muster returned for the server', async () => {
    const user = userEvent.setup();
    await renderSession();

    const href = signInLink().getAttribute('href')!;
    await user.click(signInLink());
    expect(
      screen.getByText(
        'Waiting for you to finish signing in to Grafana Cloud…',
      ),
    ).toBeInTheDocument();

    returned(href);
    expect(
      await screen.findByText('Signed in to Grafana Cloud'),
    ).toBeInTheDocument();
  });

  it('counts no return that does not name the server muster connected', async () => {
    const user = userEvent.setup();
    await renderSession({ pending: QUESTION });

    const href = signInLink().getAttribute('href')!;
    await user.click(signInLink());
    returned(href, null);
    returned(href, 'another-server');

    expect(queryDone()).not.toBeInTheDocument();
    expect(
      screen.getByText(
        'Waiting for you to finish signing in to Grafana Cloud…',
      ),
    ).toBeInTheDocument();
  });

  it('answers the question the link was passed on in with the choice that says so, once', async () => {
    const user = userEvent.setup();
    const { onAnswer } = await renderSession({
      text: QUESTION.questions[0].question,
      pending: QUESTION,
    });

    const href = signInLink().getAttribute('href')!;
    await user.click(signInLink());
    await user.click(screen.getByRole('button', { name: "I've signed in" }));
    returned(href);

    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer).toHaveBeenCalledWith({
      taskId: 'task-1',
      decision: 'approve',
      answers: [["I've signed in"]],
      text: "I've signed in",
      askedIn: 'status-1',
    });
    expect(screen.getByRole('status')).toHaveTextContent(
      "Answered the agent's question for you: “I've signed in”.",
    );
  });

  it('answers nothing while no question is open to answer', async () => {
    // The page passes no question while an answer is under way, or where it
    // withholds the question card.
    const user = userEvent.setup();
    const { onAnswer } = await renderSession({
      text: QUESTION.questions[0].question,
    });

    await user.click(signInLink());
    await user.click(screen.getByRole('button', { name: "I've signed in" }));

    expect(onAnswer).not.toHaveBeenCalled();
    expect(queryDone()).toBeInTheDocument();
  });

  it('says why it leaves a question it cannot answer for the person', async () => {
    const user = userEvent.setup();
    const pending: PendingConfirmation = {
      ...QUESTION,
      questions: [
        { ...QUESTION.questions[0], choices: ['Use Prometheus', 'Stop'] },
      ],
    };
    const { onAnswer } = await renderSession({
      text: pending.questions[0].question,
      pending,
    });

    await user.click(signInLink());
    await user.click(screen.getByRole('button', { name: "I've signed in" }));

    expect(onAnswer).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent(
      "The agent's question is still open. None of its choices says that you signed in, so answer it yourself.",
    );
  });

  it('keeps a sign-in under way past the link’s lifetime, and expires only one not started', async () => {
    const issuedAt = new Date(Date.now() - 8 * 60_000).toISOString();
    const user = userEvent.setup();
    const first = await renderSession({ items: [login(issuedAt)] });
    await user.click(signInLink());
    first.unmount();

    // Two minutes on, the tab is reloaded: the wait is still there, without
    // the stale link to reopen, and can still be finished.
    const later = Date.now() + 2 * 60_000;
    jest.spyOn(Date, 'now').mockReturnValue(later);
    await renderSession({ items: [login(issuedAt)] });

    expect(
      screen.getByText(
        'Waiting for you to finish signing in to Grafana Cloud…',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Open the sign-in page again ↗' }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: "I've signed in" }));
    expect(queryDone()).toBeInTheDocument();
    (Date.now as jest.Mock).mockRestore();
  });

  it('says a link not started has expired', async () => {
    await renderSession({
      items: [login(new Date(Date.now() - 12 * 60_000).toISOString())],
    });

    expect(
      screen.getByText(
        'The sign-in to Grafana Cloud offered here has expired. Ask the agent to start it again.',
      ),
    ).toBeInTheDocument();
  });

  it('dates a link from when the page first saw it, when the turn’s time moved on', async () => {
    const start = Date.now();
    const first = await renderSession({
      items: [login(new Date(start).toISOString())],
    });
    expect(signInLink()).toBeInTheDocument();
    first.unmount();

    // The agent worked on in the same turn: kagent stamps the call with the
    // turn's newest time, but the page saw the link twelve minutes ago.
    jest.spyOn(Date, 'now').mockReturnValue(start + 12 * 60_000);
    await renderSession({
      items: [login(new Date(start + 11 * 60_000).toISOString())],
    });
    expect(screen.getByText(/offered here has expired/)).toBeInTheDocument();
    (Date.now as jest.Mock).mockRestore();
  });

  it('as the page muster returned to, tells the other tabs, marks it done and closes', async () => {
    const first = await renderSession({ pending: QUESTION });
    const back = returnPage(signInLink().getAttribute('href')!);
    first.unmount();
    // A tab of its own: muster's return opens with fresh storage.
    window.sessionStorage.clear();

    const received: unknown[] = [];
    const otherTab = new FakeChannel(CHANNEL);
    otherTab.onmessage = event => received.push(event.data);
    const { onAnswer } = await renderSession({
      pending: QUESTION,
      path: `${back.pathname}${back.search}&server=grafana-cloud`,
    });

    await waitFor(() => expect(close).toHaveBeenCalled());
    expect(received).toEqual([
      {
        id: back.searchParams.get(SIGN_IN_RETURN_PARAM),
        server: 'grafana-cloud',
      },
    ]);
    expect(
      await screen.findByText('Signed in to Grafana Cloud'),
    ).toBeInTheDocument();
    // Only the tab that started the sign-in answers for the person.
    expect(onAnswer).not.toHaveBeenCalled();
  });
});
