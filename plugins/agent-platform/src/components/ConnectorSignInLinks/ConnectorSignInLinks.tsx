import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useHref, useLocation, useSearchParams } from 'react-router-dom';
import { Button, ButtonLink, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import CheckCircleIcon from '@material-ui/icons/CheckCircle';

import type { ConfirmationAnswer } from '../../hooks/useAnswerConfirmation';
import { useNow } from '../../hooks/useNow';
import {
  type ConnectorSignInLink,
  connectorSignInLinks,
  isSignInLinkExpired,
  questionCarries,
  sameSignInLinks,
  SIGN_IN_RETURN_PARAM,
  SIGN_IN_RETURN_SERVER_PARAM,
  signInLinkKey,
  signedInAnswer,
  withSignInReturn,
} from '../../lib/connectorSignIn';
import type { PendingConfirmation } from '../../lib/kagentHitl';
import type { TimelineItem } from '../../lib/kagentTimeline';
import type { ServerInfo } from '../../lib/toolset';

/** Where a tab muster returned to tells the session's other tabs. */
const CHANNEL = 'giantswarm.agent-platform.connector-sign-in';

/**
 * Where this tab keeps each link's progress and when it first saw it, by
 * link key, so a reload keeps both. Per tab: only the tab that started a
 * sign-in answers for the person, and another tab must not think it did.
 */
const PROGRESS_KEY = 'agent-platform.connector-sign-in.progress';
const SEEN_KEY = 'agent-platform.connector-sign-in.seen';

type SignInProgress = {
  status: 'waiting' | 'done';
  /** What became of the question the link was passed on in, once done. */
  note?: string;
};

type ConnectorSignInLinksValue = {
  linkOf: (href: string | undefined) => ConnectorSignInLink | undefined;
  progressOf: (key: string) => SignInProgress | undefined;
  /** The link to open: muster's, returning to this page once signed in. */
  hrefOf: (link: ConnectorSignInLink) => string;
  start: (key: string) => void;
  /** Marks the sign-in done: the person says so. */
  finish: (key: string) => void;
};

const ConnectorSignInLinksContext = createContext<
  ConnectorSignInLinksValue | undefined
>(undefined);

/** The sign-in's name in the page muster returns to: its key, hashed (FNV-1a). */
function returnId(key: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function openChannel(): BroadcastChannel | undefined {
  try {
    return typeof BroadcastChannel === 'undefined'
      ? undefined
      : new BroadcastChannel(CHANNEL);
  } catch {
    return undefined;
  }
}

function readStored<T>(key: string): Record<string, T> {
  try {
    const raw = window.sessionStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : undefined;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeStored(key: string, value: Record<string, unknown>): void {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Blocked storage: the progress lasts as long as the page.
  }
}

/** The earlier of the timeline's time and when this tab first saw the link. */
function earliest(at: string | undefined, seen: number | undefined) {
  const atMs = at ? Date.parse(at) : NaN;
  if (seen === undefined) {
    return at;
  }
  return Number.isFinite(atMs) && atMs < seen
    ? at
    : new Date(seen).toISOString();
}

export type ConnectorSignInLinksProps = {
  children: ReactNode;
  /** The session's timeline: the `core_auth_login` answers are read off it. */
  items: readonly TimelineItem[];
  /** The installation's MCPServer CRs: only their sign-ins are shown as one. */
  servers: ServerInfo[];
  labels: ReadonlyMap<string, string>;
  /**
   * The question a finished sign-in may answer: only while the page offers it
   * to be answered (its question card is up) and no answer is under way.
   */
  pending?: PendingConfirmation;
  onAnswer: (answer: ConfirmationAnswer) => void;
};

/**
 * Shows the connector sign-ins muster issued in a session as sign-in actions
 * wherever the agent passes the link on — its messages, its questions
 * (`MessageMarkdown` asks through {@link useConnectorSignInLink}) — and
 * follows them to the end. muster returns the sign-in's tab to this page
 * (`SIGN_IN_RETURN_PARAM`) only after a successful callback, naming the server
 * it connected; that tab tells the session's other tabs and closes where it
 * can. The tab that started the sign-in then marks it done and answers the
 * question it was passed on in for the person, once, where the question's
 * choices allow.
 */
export function ConnectorSignInLinks({
  children,
  items,
  servers,
  labels,
  pending,
  onAnswer,
}: ConnectorSignInLinksProps) {
  // The same map while the links are the same, so a streamed reply does not
  // re-render every link of the conversation (the context value stays put).
  const stable = useRef<Map<string, ConnectorSignInLink>>(new Map());
  const found = useMemo(() => {
    const next = connectorSignInLinks(items, servers, labels);
    if (!sameSignInLinks(stable.current, next)) {
      stable.current = next;
    }
    return stable.current;
  }, [items, servers, labels]);

  const [seen, setSeen] = useState<Record<string, number>>(() =>
    readStored<number>(SEEN_KEY),
  );
  useEffect(() => {
    const unseen = [...found.keys()].filter(key => seen[key] === undefined);
    if (unseen.length > 0) {
      const now = Date.now();
      const next = { ...seen };
      for (const key of unseen) {
        next[key] = now;
      }
      writeStored(SEEN_KEY, next);
      setSeen(next);
    }
  }, [found, seen]);
  // kagent stamps every item of a turn with the turn's latest time, which
  // moves on while the agent works: the time this tab first saw a link is the
  // better bound on its age when it was there to see it arrive.
  const links = useMemo(
    () =>
      new Map(
        [...found].map(([key, link]) => {
          const issuedAt = earliest(link.issuedAt, seen[key]);
          return [key, issuedAt ? { ...link, issuedAt } : link];
        }),
      ),
    [found, seen],
  );

  const [progress, setProgress] = useState<Record<string, SignInProgress>>(() =>
    readStored<SignInProgress>(PROGRESS_KEY),
  );
  const updateProgress = useCallback(
    (key: string, next: SignInProgress) =>
      setProgress(previous => {
        const updated = { ...previous, [key]: next };
        writeStored(PROGRESS_KEY, updated);
        return updated;
      }),
    [],
  );

  const [searchParams, setSearchParams] = useSearchParams();
  // The page muster returns the sign-in's tab to: this one, as the browser
  // addresses it (the app's base path included).
  const page = useHref(useLocation().pathname);

  // Read in the callbacks below, which the channel's listener outlives.
  const latest = useRef({ links, progress, pending, onAnswer });
  latest.current = { links, progress, pending, onAnswer };
  // The questions this tab answered, so one is never answered twice.
  const answered = useRef(new Set<string>());

  const finish = useCallback(
    (key: string) => {
      const current = latest.current;
      const link = current.links.get(key);
      if (!link || current.progress[key]?.status === 'done') {
        return;
      }
      const started = current.progress[key]?.status === 'waiting';
      let note: string | undefined;
      const question = current.pending;
      const asked = question && `${question.taskId}|${question.askedIn ?? ''}`;
      // Only the tab that started the sign-in answers, only the question that
      // passed this very link on, and only once.
      if (
        started &&
        question?.asks === 'input' &&
        asked &&
        !answered.current.has(asked) &&
        question.questions.some(entry => questionCarries(entry.question, key))
      ) {
        const answer = signedInAnswer(question.questions, link.label);
        if ('reason' in answer) {
          note = `The agent's question is still open. ${answer.reason}`;
        } else {
          answered.current.add(asked);
          note = `Answered the agent's question for you: “${answer.text}”.`;
          current.onAnswer({
            taskId: question.taskId,
            decision: 'approve',
            answers: answer.answers,
            text: answer.text,
            ...(question.askedIn && { askedIn: question.askedIn }),
          });
        }
      }
      updateProgress(key, { status: 'done', ...(note && { note }) });
    },
    [updateProgress],
  );

  const start = useCallback(
    (key: string) => {
      if (latest.current.progress[key]?.status !== 'done') {
        updateProgress(key, { status: 'waiting' });
      }
    },
    [updateProgress],
  );

  // muster names the server it connected on the way back; a return for
  // another server, or none, finishes nothing.
  const finishReturned = useCallback(
    (id: string, server: unknown) => {
      for (const [key, link] of latest.current.links) {
        if (
          returnId(key) === id &&
          typeof server === 'string' &&
          link.servers.includes(server)
        ) {
          finish(key);
        }
      }
    },
    [finish],
  );

  // A tab muster returned to says so to the session's other tabs.
  useEffect(() => {
    const channel = openChannel();
    if (!channel) {
      return undefined;
    }
    channel.onmessage = (event: MessageEvent) => {
      const data = event.data as { id?: unknown; server?: unknown } | undefined;
      if (typeof data?.id === 'string') {
        finishReturned(data.id, data.server);
      }
    };
    return () => channel.close();
  }, [finishReturned]);

  // This tab is the one muster returned to: tell the others, mark it here too
  // once the timeline has the link, and close — a tab the link opened can be.
  const returned = searchParams.get(SIGN_IN_RETURN_PARAM);
  const returnedServer = searchParams.get(SIGN_IN_RETURN_SERVER_PARAM);
  const [arrival, setArrival] = useState<{ id: string; server?: string }>();
  useEffect(() => {
    if (!returned) {
      return;
    }
    const server = returnedServer ?? undefined;
    setArrival({ id: returned, server });
    const channel = openChannel();
    channel?.postMessage({ id: returned, server });
    channel?.close();
    setSearchParams(
      previous => {
        const next = new URLSearchParams(previous);
        next.delete(SIGN_IN_RETURN_PARAM);
        next.delete(SIGN_IN_RETURN_SERVER_PARAM);
        return next;
      },
      { replace: true },
    );
    window.close();
  }, [returned, returnedServer, setSearchParams]);
  useEffect(() => {
    if (arrival) {
      finishReturned(arrival.id, arrival.server);
    }
  }, [arrival, links, finishReturned]);

  const value = useMemo<ConnectorSignInLinksValue>(
    () => ({
      linkOf: href => {
        const key = signInLinkKey(href);
        return key ? links.get(key) : undefined;
      },
      progressOf: key => progress[key],
      hrefOf: link => {
        const back = new URL(page, window.location.origin);
        back.searchParams.set(SIGN_IN_RETURN_PARAM, returnId(link.key));
        return withSignInReturn(link.url, back.toString());
      },
      start,
      finish,
    }),
    [links, progress, page, start, finish],
  );

  return (
    <ConnectorSignInLinksContext.Provider value={value}>
      {children}
    </ConnectorSignInLinksContext.Provider>
  );
}

const useStyles = makeStyles(theme => ({
  action: {
    display: 'inline-flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.spacing(1),
    margin: theme.spacing(0.5, 0),
    verticalAlign: 'middle',
  },
  done: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: theme.spacing(0.5),
    color: 'var(--bui-fg-positive, #1f7a1f)',
    '& svg': { fontSize: 18 },
  },
}));

/**
 * The sign-in a link in agent prose stands for, when it is one muster issued
 * in this session for a connector the portal knows; `undefined` for any other
 * link, and outside a session.
 */
export function useConnectorSignInLink(
  href: string | undefined,
): ConnectorSignInLink | undefined {
  return useContext(ConnectorSignInLinksContext)?.linkOf(href);
}

/**
 * A muster sign-in link in agent prose, as the action it is: *Sign in to
 * Grafana Cloud*, then the wait, then done — never the URL itself.
 */
export function ConnectorSignInAction({ link }: { link: ConnectorSignInLink }) {
  const classes = useStyles();
  const context = useContext(ConnectorSignInLinksContext);
  const now = useNow(30_000);
  if (!context) {
    return null;
  }
  const progress = context.progressOf(link.key);

  if (progress?.status === 'done') {
    return (
      <span className={classes.action} role="status">
        <span className={classes.done}>
          <CheckCircleIcon aria-hidden />
          <Text as="span" variant="body-medium" weight="bold">
            Signed in to {link.label}
          </Text>
        </span>
        {progress.note && (
          <Text as="span" variant="body-small" color="secondary">
            {progress.note}
          </Text>
        )}
      </span>
    );
  }

  // A sign-in under way stays under way past the link's lifetime: muster's
  // limit is on starting the flow, and the tab opened in time may still
  // finish it. Only reopening the stale link is no longer offered.
  const isExpired = isSignInLinkExpired(link, now);
  const href = context.hrefOf(link);
  if (progress?.status === 'waiting') {
    return (
      <span className={classes.action}>
        <Text as="span" variant="body-small" color="secondary" role="status">
          Waiting for you to finish signing in to {link.label}…
        </Text>
        {!isExpired && (
          <ButtonLink
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            variant="tertiary"
            size="small"
          >
            Open the sign-in page again ↗
          </ButtonLink>
        )}
        <Button
          variant="tertiary"
          size="small"
          onPress={() => context.finish(link.key)}
        >
          I've signed in
        </Button>
      </span>
    );
  }

  if (isExpired) {
    return (
      <Text as="span" variant="body-small" color="secondary">
        The sign-in to {link.label} offered here has expired. Ask the agent to
        start it again.
      </Text>
    );
  }

  return (
    <span className={classes.action}>
      <ButtonLink
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        variant="primary"
        size="small"
        onPress={() => context.start(link.key)}
      >
        Sign in to {link.label} ↗
      </ButtonLink>
    </span>
  );
}
