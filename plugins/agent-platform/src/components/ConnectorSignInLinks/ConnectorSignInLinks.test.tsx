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
const LOGIN: TimelineItem = {
  kind: 'tool-call',
  id: 'c1',
  taskIndex: 0,
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

async function renderSession({
  text = `Sign in here: ${LINK}`,
  pending,
  onAnswer = jest.fn(),
  path = '/sessions/gazelle/s1',
}: {
  text?: string;
  pending?: PendingConfirmation;
  onAnswer?: (answer: ConfirmationAnswer) => void;
  path?: string;
} = {}) {
  const rendered = await renderInTestApp(
    <ConnectorSignInLinks
      items={[LOGIN]}
      servers={SERVERS}
      labels={connectorLabels(SERVERS)}
      pending={pending}
      onAnswer={onAnswer}
    >
      <MessageMarkdown text={text} />
    </ConnectorSignInLinks>,
    { initialRouteEntries: [path] },
  );
  return { ...rendered, onAnswer };
}

const signInLink = () =>
  screen.getByRole('link', { name: 'Sign in to Grafana Cloud ↗' });

/** What muster returns the sign-in's tab to, as the link asks it to. */
function returnPage(href: string): URL {
  return new URL(new URL(href).searchParams.get('redirect')!);
}

describe('ConnectorSignInLinks', () => {
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

    expect(screen.getByRole('link', { name: 'this' })).toHaveAttribute(
      'href',
      other,
    );
    expect(signInLink()).toBeInTheDocument();
  });

  it('waits once started, and is done when the tab muster returned to says so', async () => {
    const user = userEvent.setup();
    await renderSession();

    const href = signInLink().getAttribute('href')!;
    await user.click(signInLink());
    expect(
      screen.getByText(
        'Waiting for you to finish signing in to Grafana Cloud…',
      ),
    ).toBeInTheDocument();

    // The tab muster sends back after the callback tells this one.
    const id = returnPage(href).searchParams.get(SIGN_IN_RETURN_PARAM);
    act(() => {
      new FakeChannel(
        'giantswarm.agent-platform.connector-sign-in',
      ).postMessage({ id });
    });
    expect(
      await screen.findByText('Signed in to Grafana Cloud'),
    ).toBeInTheDocument();
    expect(signInLinkQuery()).not.toBeInTheDocument();
  });

  it('answers the question the link was passed on in with the choice that says so', async () => {
    const user = userEvent.setup();
    const { onAnswer } = await renderSession({
      text: QUESTION.questions[0].question,
      pending: QUESTION,
    });

    await user.click(signInLink());
    await user.click(screen.getByRole('button', { name: "I've signed in" }));

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

  it('as the page muster returned to, tells the other tabs, marks it done and closes', async () => {
    const first = await renderSession({ pending: QUESTION });
    const back = returnPage(signInLink().getAttribute('href')!);
    first.unmount();

    const received: unknown[] = [];
    const otherTab = new FakeChannel(
      'giantswarm.agent-platform.connector-sign-in',
    );
    otherTab.onmessage = event => received.push(event.data);
    const { onAnswer } = await renderSession({
      pending: QUESTION,
      path: `${back.pathname}${back.search}&server=grafana-cloud`,
    });

    await waitFor(() => expect(close).toHaveBeenCalled());
    expect(received).toEqual([
      { id: back.searchParams.get(SIGN_IN_RETURN_PARAM) },
    ]);
    expect(
      await screen.findByText('Signed in to Grafana Cloud'),
    ).toBeInTheDocument();
    // Only the tab that started the sign-in answers for the person.
    expect(onAnswer).not.toHaveBeenCalled();
  });
});

function signInLinkQuery() {
  return screen.queryByRole('link', { name: 'Sign in to Grafana Cloud ↗' });
}
