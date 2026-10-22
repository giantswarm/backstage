import {
  connectorSignInLinks,
  isSignInLinkExpired,
  questionCarries,
  signedInAnswer,
  signInLinkKey,
  withSignInReturn,
} from './connectorSignIn';
import type { TimelineItem } from './kagentTimeline';
import { connectorLabels, type ServerInfo } from './toolset';

const LINK =
  'https://muster.example.com/oauth/proxy/start?state=abc123&client=x';

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
const LABELS = connectorLabels(SERVERS);

function loginCall(
  result: unknown,
  args: unknown = { server: 'grafana-cloud' },
): Extract<TimelineItem, { kind: 'tool-call' }> {
  return {
    kind: 'tool-call',
    id: 'c1',
    taskIndex: 0,
    at: '2026-10-22T13:31:00Z',
    toolName: 'core_auth_login',
    via: 'Muster',
    args,
    result,
    isPending: false,
  };
}

/** muster's answer, as `call_tool` relays it: its result as JSON text. */
const PROXIED = {
  content: [
    {
      type: 'text',
      text: JSON.stringify({
        content: [
          `Authentication Required\n\nServer: grafana-cloud\nStatus: needs sign-in\n\nPlease sign in to connect to this server:\n\n${LINK}\n\nAfter signing in, run this tool again to complete the connection.`,
        ],
        structuredContent: { authUrl: LINK },
      }),
    },
  ],
};

describe('signInLinkKey', () => {
  it('keys a muster sign-in link by origin, path and state alone', () => {
    expect(signInLinkKey(LINK)).toBe(
      'https://muster.example.com/oauth/proxy/start?state=abc123',
    );
    expect(signInLinkKey(`${LINK}&redirect=https://portal.example.com/`)).toBe(
      signInLinkKey(LINK),
    );
  });

  it('is undefined for any other link', () => {
    expect(signInLinkKey('https://grafana.example.com/login')).toBeUndefined();
    expect(
      signInLinkKey('https://muster.example.com/oauth/proxy/start'),
    ).toBeUndefined();
    expect(
      signInLinkKey('ftp://muster.example.com/oauth/proxy/start?state=x'),
    ).toBeUndefined();
    expect(signInLinkKey('not a url')).toBeUndefined();
    expect(signInLinkKey(undefined)).toBeUndefined();
  });
});

describe('connectorSignInLinks', () => {
  it('reads the links of core_auth_login answers, proxied or not', () => {
    const links = connectorSignInLinks(
      [loginCall(PROXIED, { server: 'grafana-cloud' })],
      SERVERS,
      LABELS,
    );
    expect([...links.values()]).toEqual([
      {
        key: signInLinkKey(LINK),
        url: LINK,
        server: 'grafana-cloud',
        label: 'Grafana Cloud',
        issuedAt: '2026-10-22T13:31:00Z',
      },
    ]);
    // The server named in the answer, when the call's arguments do not.
    expect(
      connectorSignInLinks([loginCall(PROXIED, {})], SERVERS, LABELS).size,
    ).toBe(1);
  });

  it('ignores a connector the portal does not know and every other tool', () => {
    expect(
      connectorSignInLinks(
        [loginCall(PROXIED, { server: 'elsewhere' })],
        SERVERS,
        LABELS,
      ).size,
    ).toBe(0);
    expect(
      connectorSignInLinks(
        [{ ...loginCall(PROXIED), toolName: 'x_grafana-cloud_query' }],
        SERVERS,
        LABELS,
      ).size,
    ).toBe(0);
    expect(
      connectorSignInLinks(
        [
          {
            kind: 'agent-message',
            id: 'm1',
            taskIndex: 0,
            text: `Sign in here: ${LINK}`,
          },
        ],
        SERVERS,
        LABELS,
      ).size,
    ).toBe(0);
  });
});

describe('isSignInLinkExpired', () => {
  it('expires a link muster no longer honours', () => {
    const issuedAt = '2026-10-22T13:31:00Z';
    const issued = Date.parse(issuedAt);
    expect(isSignInLinkExpired({ issuedAt }, issued + 8 * 60_000)).toBe(false);
    expect(isSignInLinkExpired({ issuedAt }, issued + 10 * 60_000)).toBe(true);
    expect(isSignInLinkExpired({}, issued + 60 * 60_000)).toBe(false);
  });
});

describe('withSignInReturn', () => {
  it('asks muster to return to the page', () => {
    const url = new URL(
      withSignInReturn(LINK, 'https://portal.example.com/sessions/a/b?x=1'),
    );
    expect(url.searchParams.get('state')).toBe('abc123');
    expect(url.searchParams.get('redirect')).toBe(
      'https://portal.example.com/sessions/a/b?x=1',
    );
  });
});

describe('questionCarries', () => {
  it('finds the link in a question, however the agent wrote it', () => {
    expect(
      questionCarries(`Sign in at ${LINK} first.`, signInLinkKey(LINK)!),
    ).toBe(true);
    expect(questionCarries(`[Sign in](${LINK})`, signInLinkKey(LINK)!)).toBe(
      true,
    );
    expect(
      questionCarries(
        'Open https://muster.example.com/oauth/proxy/start?state=abc123.',
        signInLinkKey(LINK)!,
      ),
    ).toBe(true);
    expect(questionCarries('Have you signed in?', signInLinkKey(LINK)!)).toBe(
      false,
    );
  });
});

describe('signedInAnswer', () => {
  it('picks the one choice that says the person signed in', () => {
    expect(
      signedInAnswer(
        [
          {
            question: `Sign in: ${LINK}`,
            choices: ["I've signed in", "I can't sign in right now"],
            multiple: false,
          },
        ],
        'Grafana Cloud',
      ),
    ).toEqual({ answers: [["I've signed in"]], text: "I've signed in" });
  });

  it('answers a free-text question in words', () => {
    expect(
      signedInAnswer(
        [{ question: `Sign in: ${LINK}`, multiple: false }],
        'Grafana Cloud',
      ),
    ).toEqual({
      answers: [["I've signed in to Grafana Cloud."]],
      text: "I've signed in to Grafana Cloud.",
    });
  });

  it('says why it cannot answer for the person', () => {
    expect(
      signedInAnswer(
        [{ question: 'Pick one', choices: ['Retry', 'Skip'], multiple: false }],
        'Grafana Cloud',
      ),
    ).toEqual({
      reason:
        'None of its choices says that you signed in, so answer it yourself.',
    });
    expect(
      signedInAnswer(
        [
          { question: 'One', multiple: false },
          { question: 'Two', multiple: false },
        ],
        'Grafana Cloud',
      ),
    ).toHaveProperty('reason');
    expect(
      signedInAnswer(
        [{ question: 'Q', choices: ['Done', 'Signed in'], multiple: false }],
        'Grafana Cloud',
      ),
    ).toHaveProperty('reason');
  });
});
