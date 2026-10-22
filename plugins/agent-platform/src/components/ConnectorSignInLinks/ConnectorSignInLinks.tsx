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
  SIGN_IN_RETURN_PARAM,
  signInLinkKey,
  signedInAnswer,
  withSignInReturn,
} from '../../lib/connectorSignIn';
import type { PendingConfirmation } from '../../lib/kagentHitl';
import type { TimelineItem } from '../../lib/kagentTimeline';
import type { ServerInfo } from '../../lib/toolset';

/** Where a tab muster returned to tells the session's other tabs. */
const CHANNEL = 'giantswarm.agent-platform.connector-sign-in';

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

export type ConnectorSignInLinksProps = {
  children: ReactNode;
  /** The session's timeline: the `core_auth_login` answers are read off it. */
  items: readonly TimelineItem[];
  /** The installation's MCPServer CRs: only their sign-ins are shown as one. */
  servers: ServerInfo[];
  labels: ReadonlyMap<string, string>;
  /** The question the session waits on, which a finished sign-in may answer. */
  pending?: PendingConfirmation;
  onAnswer: (answer: ConfirmationAnswer) => void;
};

/**
 * Shows the connector sign-ins muster issued in a session as sign-in actions
 * wherever the agent passes the link on — its messages, its questions
 * (`MessageMarkdown` asks through {@link useConnectorSignInLink}) — and
 * follows them to the end: muster returns the sign-in's tab to this page
 * (`SIGN_IN_RETURN_PARAM`), which tells the session's other tabs and closes
 * where it can. The tab that started it then marks it done and answers the
 * question it was passed on in for the person, where the question's choices
 * allow.
 */
export function ConnectorSignInLinks({
  children,
  items,
  servers,
  labels,
  pending,
  onAnswer,
}: ConnectorSignInLinksProps) {
  const links = useMemo(
    () => connectorSignInLinks(items, servers, labels),
    [items, servers, labels],
  );
  const [progress, setProgress] = useState<ReadonlyMap<string, SignInProgress>>(
    new Map(),
  );
  const [searchParams, setSearchParams] = useSearchParams();
  // The page muster returns the sign-in's tab to: this one, as the browser
  // addresses it (the app's base path included).
  const page = useHref(useLocation().pathname);

  // Read in the callbacks below, which the channel's listener outlives.
  const latest = useRef({ links, progress, pending, onAnswer });
  latest.current = { links, progress, pending, onAnswer };

  const finish = useCallback((key: string) => {
    const current = latest.current;
    const link = current.links.get(key);
    if (!link || current.progress.get(key)?.status === 'done') {
      return;
    }
    const started = current.progress.get(key)?.status === 'waiting';
    let note: string | undefined;
    const question = current.pending;
    // Only the tab that started the sign-in answers, and only the question
    // that passed this very link on: one answer, to what was asked about it.
    if (
      started &&
      question?.asks === 'input' &&
      question.questions.some(entry => questionCarries(entry.question, key))
    ) {
      const answer = signedInAnswer(question.questions, link.label);
      if ('reason' in answer) {
        note = `The agent's question is still open. ${answer.reason}`;
      } else {
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
    setProgress(previous =>
      new Map(previous).set(key, { status: 'done', ...(note && { note }) }),
    );
  }, []);

  const start = useCallback((key: string) => {
    setProgress(previous =>
      previous.get(key)?.status === 'done'
        ? previous
        : new Map(previous).set(key, { status: 'waiting' }),
    );
  }, []);

  const finishByReturnId = useCallback(
    (id: string) => {
      for (const key of latest.current.links.keys()) {
        if (returnId(key) === id) {
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
      const id = (event.data as { id?: unknown } | undefined)?.id;
      if (typeof id === 'string') {
        finishByReturnId(id);
      }
    };
    return () => channel.close();
  }, [finishByReturnId]);

  // This tab is the one muster returned to: tell the others, mark it here too
  // once the timeline has the link, and close — a tab the link opened can be.
  const returned = searchParams.get(SIGN_IN_RETURN_PARAM);
  const [returnedId, setReturnedId] = useState<string>();
  useEffect(() => {
    if (!returned) {
      return;
    }
    setReturnedId(returned);
    const channel = openChannel();
    channel?.postMessage({ id: returned });
    channel?.close();
    setSearchParams(
      previous => {
        const next = new URLSearchParams(previous);
        next.delete(SIGN_IN_RETURN_PARAM);
        next.delete('server');
        return next;
      },
      { replace: true },
    );
    window.close();
  }, [returned, setSearchParams]);
  useEffect(() => {
    if (returnedId) {
      finishByReturnId(returnedId);
    }
  }, [returnedId, links, finishByReturnId]);

  const value = useMemo<ConnectorSignInLinksValue>(
    () => ({
      linkOf: href => {
        const key = signInLinkKey(href);
        return key ? links.get(key) : undefined;
      },
      progressOf: key => progress.get(key),
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

  if (isSignInLinkExpired(link, now)) {
    return (
      <Text as="span" variant="body-small" color="secondary">
        The sign-in to {link.label} offered here has expired. Ask the agent to
        start it again.
      </Text>
    );
  }

  const href = context.hrefOf(link);
  if (progress?.status === 'waiting') {
    return (
      <span className={classes.action}>
        <Text as="span" variant="body-small" color="secondary" role="status">
          Waiting for you to finish signing in to {link.label}…
        </Text>
        <ButtonLink
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          variant="tertiary"
          size="small"
        >
          Open the sign-in page again ↗
        </ButtonLink>
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
