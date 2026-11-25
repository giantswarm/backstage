import { useCallback, useEffect, useRef } from 'react';
import { useHref, useLocation, useSearchParams } from 'react-router-dom';
import { Alert, Button, Flex, Text } from '@backstage/ui';
import { useApi } from '@backstage/core-plugin-api';
import {
  externalUrlConsentApiRef,
  NewTabLabel,
} from '@giantswarm/backstage-plugin-ui-react';
import { makeStyles } from '@material-ui/core';
import InfoOutlinedIcon from '@material-ui/icons/InfoOutlined';

import type { ConfirmationAnswer } from '../../hooks/useAnswerConfirmation';
import type { PendingConfirmation } from '../../lib/kagentHitl';
import {
  ELICITATION_RETURN_PARAM,
  elicitationHref,
  isOnOrigin,
  linkHost,
  returnedElicitationId,
} from '../../lib/urlElicitation';

/** Where a tab muster returned to tells the session's other tabs. */
export const URL_ELICITATION_CHANNEL =
  'giantswarm.agent-platform.url-elicitation';

/**
 * The elicitations this tab opened, by `elicitationId`, so a reload keeps
 * them. Per tab: only the tab that opened the page answers for the person
 * when muster returns, and another tab must not think it did.
 */
const OPENED_KEY = 'agent-platform.url-elicitation.opened';

function openChannel(): BroadcastChannel | undefined {
  try {
    return typeof BroadcastChannel === 'undefined'
      ? undefined
      : new BroadcastChannel(URL_ELICITATION_CHANNEL);
  } catch {
    return undefined;
  }
}

function readOpened(): string[] {
  try {
    const parsed = JSON.parse(
      window.sessionStorage.getItem(OPENED_KEY) ?? '[]',
    );
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === 'string')
      : [];
  } catch {
    return [];
  }
}

function markOpened(elicitationId: string): void {
  try {
    const opened = readOpened().filter(id => id !== elicitationId);
    // The last few are enough: an elicitation lives minutes.
    window.sessionStorage.setItem(
      OPENED_KEY,
      JSON.stringify([...opened, elicitationId].slice(-20)),
    );
  } catch {
    // Blocked storage: the person says Done themselves.
  }
}

/**
 * The page muster returns the browser to after one of its pages: tells the
 * session's other tabs (and this one) which elicitation the person finished,
 * drops the parameter and closes the tab, which the link opened. Called by
 * the session page, whether or not it shows the prompt yet.
 */
export function useUrlElicitationReturn(): void {
  const [searchParams, setSearchParams] = useSearchParams();
  const returned = returnedElicitationId(searchParams);
  useEffect(() => {
    if (!returned) {
      return;
    }
    const channel = openChannel();
    channel?.postMessage({ elicitationId: returned });
    channel?.close();
    setSearchParams(
      previous => {
        const next = new URLSearchParams(previous);
        next.delete(ELICITATION_RETURN_PARAM);
        return next;
      },
      { replace: true },
    );
    window.close();
  }, [returned, setSearchParams]);
}

const useStyles = makeStyles(theme => ({
  // The same frame as the confirmation card it stands in for: attached to the
  // message box it unblocks.
  card: {
    display: 'flex',
    flexDirection: 'column',
    boxSizing: 'border-box',
    border: '1px solid var(--bui-border-1, #e0e0e0)',
    borderRadius: 'var(--bui-radius-4, 16px)',
    backgroundColor: `var(--bui-bg-neutral-1, ${theme.palette.background.paper})`,
    padding: theme.spacing(1.5, 2),
    gap: theme.spacing(1.5),
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: theme.spacing(1.5),
    '& > svg': { marginTop: 2 },
  },
  heading: {
    overflowWrap: 'anywhere',
  },
}));

export type UrlElicitationPanelProps = {
  pending: PendingConfirmation;
  isAnswering: boolean;
  error?: string;
  onAnswer: (answer: ConfirmationAnswer) => void;
  /**
   * The origin of the session's muster. A link on it, with an
   * `elicitationId`, returns to this page, and the agent continues once the
   * person is done there; any other link opens as sent.
   */
  musterOrigin?: string;
};

/**
 * An MCP server's URL elicitation the agent waits on (`pending.asks ===
 * 'url'`), the same for every one: muster's sign-in, its approval page for a
 * tool call, or any later page. The server's message is the heading; *Open*
 * names the host the link leads to and goes through the portal's consent
 * dialog; *Done* tells the agent to go on, *Not now* declines.
 *
 * The prompt knows nothing of what the page decides. The agent retries the
 * call on *Done*, and the outcome is muster's answer to that retry, which the
 * timeline shows as the tool call's result: an approval page the person did
 * not approve leaves the call refused there, whatever the prompt said.
 */
export function UrlElicitationPanel({
  pending,
  isAnswering,
  error,
  onAnswer,
  musterOrigin,
}: UrlElicitationPanelProps) {
  const classes = useStyles();
  const consentApi = useApi(externalUrlConsentApiRef);
  const elicitation = pending.elicitation;
  // The page muster returns the browser to: this one, as the browser
  // addresses it (the app's base path included).
  const page = useHref(useLocation().pathname);

  const answer = useCallback(
    (decision: ConfirmationAnswer['decision']) =>
      onAnswer({
        taskId: pending.taskId,
        decision,
        text: decision === 'approve' ? 'Done.' : 'Not now.',
        ...(pending.askedIn && { askedIn: pending.askedIn }),
      }),
    [onAnswer, pending.taskId, pending.askedIn],
  );

  // muster returned from the page this tab opened: the agent goes on, once.
  const elicitationId = elicitation?.elicitationId;
  const latest = useRef({ answer, isAnswering });
  latest.current = { answer, isAnswering };
  const answered = useRef<string>();
  useEffect(() => {
    if (!elicitationId) {
      return undefined;
    }
    const channel = openChannel();
    if (!channel) {
      return undefined;
    }
    channel.onmessage = (event: MessageEvent) => {
      const data = event.data as { elicitationId?: unknown } | undefined;
      if (
        data?.elicitationId !== elicitationId ||
        answered.current === elicitationId ||
        latest.current.isAnswering ||
        !readOpened().includes(elicitationId)
      ) {
        return;
      }
      answered.current = elicitationId;
      latest.current.answer('approve');
    };
    return () => channel.close();
  }, [elicitationId]);

  if (!elicitation) {
    return null;
  }
  const host = linkHost(elicitation.url);
  const returns = Boolean(
    elicitationId && isOnOrigin(elicitation.url, musterOrigin),
  );
  const open = async () => {
    const href = elicitationHref(elicitation.url, {
      musterOrigin,
      elicitationId,
      back: new URL(page, window.location.origin).toString(),
    });
    const consent = await consentApi.open({
      url: href,
      requester: elicitation.server,
      ...(elicitation.message && { message: elicitation.message }),
    });
    if (consent === 'accept' && returns && elicitationId) {
      markOpened(elicitationId);
    }
  };

  return (
    <section
      aria-label="Request from the agent's tools"
      className={classes.card}
      data-testid="url-elicitation-card"
    >
      <div className={classes.header}>
        <InfoOutlinedIcon aria-hidden fontSize="small" />
        <Text
          as="p"
          variant="body-medium"
          weight="bold"
          className={classes.heading}
        >
          {elicitation.message ??
            `${elicitation.server} asks you to open a page so the agent can continue.`}
        </Text>
      </div>
      {error && (
        <Alert status="danger" title="Answer not sent" description={error} />
      )}
      <Flex align="center" gap="2" style={{ flexWrap: 'wrap' }}>
        <Button variant="primary" size="small" onPress={() => void open()}>
          <NewTabLabel>Open</NewTabLabel>
        </Button>
        {host && (
          <Text as="span" variant="body-small" color="secondary">
            {host}
          </Text>
        )}
        <Button
          variant="secondary"
          size="small"
          isDisabled={isAnswering}
          onPress={() => answer('approve')}
        >
          Done
        </Button>
        <Button
          variant="tertiary"
          size="small"
          isDisabled={isAnswering}
          onPress={() => answer('reject')}
        >
          Not now
        </Button>
      </Flex>
    </section>
  );
}
