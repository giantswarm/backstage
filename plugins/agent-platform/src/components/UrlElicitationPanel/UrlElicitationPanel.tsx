import { useCallback, useEffect, useRef, useState } from 'react';
import { useHref, useLocation, useSearchParams } from 'react-router-dom';
import { Alert, Button, Flex, Text } from '@backstage/ui';
import { identityApiRef, useApi } from '@backstage/core-plugin-api';
import {
  externalUrlConsentApiRef,
  NewTabLabel,
} from '@giantswarm/backstage-plugin-ui-react';
import { makeStyles } from '@material-ui/core';
import InfoOutlinedIcon from '@material-ui/icons/InfoOutlined';

import type { ConfirmationAnswer } from '../../hooks/useAnswerConfirmation';
import type { PendingConfirmation } from '../../lib/kagentHitl';
import {
  announceElicitationReturn,
  listenForElicitationReturn,
  URL_ELICITATION_CHANNEL,
} from '../../lib/urlElicitationChannel';
import {
  ELICITATION_NONCE_PARAM,
  ELICITATION_RETURN_PARAM,
  elicitationHref,
  linkHost,
  musterPageKind,
  newReturnNonce,
  returnedElicitation,
  withHandoff,
  type MusterPages,
} from '../../lib/urlElicitation';

/**
 * The links this tab opened, one record per open, so a reload keeps them.
 * Per tab (`sessionStorage`): only the tab that opened the page answers for
 * the person when muster returns, and another tab must not think it did.
 */
const OPENED_KEY = 'agent-platform.url-elicitation.opened';

/** One open of a link that returns: what the return must match. */
type OpenedRecord = {
  /** The random value the return carries back. */
  nonce: string;
  elicitationId: string;
  /** The task that asked, in this session. */
  taskId: string;
  /** The session page the link returns to. */
  page: string;
  /** Who opened it. */
  user: string;
};

export { URL_ELICITATION_CHANNEL };

function readOpened(): OpenedRecord[] {
  try {
    const parsed = JSON.parse(
      window.sessionStorage.getItem(OPENED_KEY) ?? '[]',
    );
    return Array.isArray(parsed)
      ? parsed.filter(
          (entry): entry is OpenedRecord =>
            typeof entry === 'object' &&
            entry !== null &&
            ['nonce', 'elicitationId', 'taskId', 'page', 'user'].every(
              key =>
                typeof (entry as Record<string, unknown>)[key] === 'string',
            ),
        )
      : [];
  } catch {
    return [];
  }
}

function writeOpened(records: OpenedRecord[]): void {
  try {
    // The last few are enough: an elicitation lives minutes.
    window.sessionStorage.setItem(
      OPENED_KEY,
      JSON.stringify(records.slice(-20)),
    );
  } catch {
    // Blocked storage: the person says Done themselves.
  }
}

/**
 * Takes the record a return matches out of this tab's opens, so it is
 * answered once: the same nonce, the elicitation the prompt shows, its task,
 * this session page and this person. False when none matches.
 */
function takeOpened(match: OpenedRecord): boolean {
  const records = readOpened();
  const index = records.findIndex(
    record =>
      record.nonce === match.nonce &&
      record.elicitationId === match.elicitationId &&
      record.taskId === match.taskId &&
      record.page === match.page &&
      record.user === match.user,
  );
  if (index < 0) {
    return false;
  }
  writeOpened(records.filter((_, i) => i !== index));
  return true;
}

/**
 * The page muster returns the browser to after one of its pages: tells the
 * session's other tabs (and this one) which elicitation the person finished
 * and with which open's value, drops both from the address and closes the
 * tab, which the link opened (a browser lets a script close only a tab a
 * script opened). A visit without both does nothing. Called by the session
 * page, whether or not it shows the prompt yet. True once this tab is such a
 * return tab, so the page can say the person may close it.
 */
export function useUrlElicitationReturn(): boolean {
  const [returnedHere, setReturnedHere] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const returned = returnedElicitation(searchParams);
  const elicitationId = returned?.elicitationId;
  const nonce = returned?.nonce;
  useEffect(() => {
    if (!elicitationId || !nonce) {
      return;
    }
    announceElicitationReturn({ elicitationId, nonce });
    setReturnedHere(true);
    setSearchParams(
      previous => {
        const next = new URLSearchParams(previous);
        next.delete(ELICITATION_RETURN_PARAM);
        next.delete(ELICITATION_NONCE_PARAM);
        return next;
      },
      { replace: true },
    );
    window.close();
  }, [elicitationId, nonce, setSearchParams]);
  return returnedHere;
}

/**
 * What the tab muster returned to shows: the chat goes on in the tab that
 * opened the page, so this one may be closed. It says nothing of what was
 * decided there (the return does not carry it).
 */
export function ElicitationReturnNotice() {
  return (
    <div
      role="status"
      data-testid="elicitation-return-notice"
      style={{ padding: 32 }}
    >
      <Text as="p" variant="title-small" weight="bold">
        Done — you can close this tab
      </Text>
      <Text as="p" variant="body-medium" color="secondary">
        The chat continues in the tab where you started.
      </Text>
    </div>
  );
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
   * Where the session's muster serves its pages. A link to its approval page
   * or sign-in start there, with an `elicitationId`, returns to this page,
   * and the agent continues once the person is done there; any other link
   * opens as sent.
   */
  musterPages?: MusterPages;
  /**
   * Asks muster for a one-time sign-in handoff ticket for one of its pages,
   * so the page opens signed in as the person (contract-muster-approval.md
   * §5a); without it, or without a ticket, muster signs the browser in.
   */
  requestHandoff?: (url: string) => Promise<string | undefined>;
};

/**
 * Opens a blank tab for a link the person asked for, at once, while the
 * click still allows a new tab, cut off from this page (`opener`), to be
 * pointed at the link once it is known. `undefined` when the browser opens
 * none (a blocked pop-up).
 */
function openBlankTab(): Window | undefined {
  const tab = window.open('about:blank', '_blank');
  if (!tab) {
    return undefined;
  }
  try {
    tab.opener = null;
  } catch {
    // Some browsers do not let the opener go; the page is muster's own.
  }
  return tab;
}

/**
 * An MCP server's URL elicitation the agent waits on (`pending.asks ===
 * 'url'`), the same for every one: muster's sign-in, its approval page for a
 * tool call, or any later page. The server's message is the heading; *Open*
 * names the host the link leads to. A link to one of the configured muster's
 * own pages (its approval page, its connector sign-in start, by origin and
 * path) opens at once in a new tab, signed in through a one-time handoff
 * when muster issues one: the person already chose *Open* here, and the
 * chat line names the host and the server's message. Any other link goes
 * through the portal's consent dialog. *Done* tells the agent to go on, *Not
 * now* declines.
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
  musterPages,
  requestHandoff,
}: UrlElicitationPanelProps) {
  const classes = useStyles();
  const consentApi = useApi(externalUrlConsentApiRef);
  const identityApi = useApi(identityApiRef);
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

  // muster returned from a page this tab opened for this elicitation, in
  // this session, as this person: the agent goes on, once.
  const elicitationId = elicitation?.elicitationId;
  const latest = useRef({ answer, isAnswering, taskId: pending.taskId, page });
  latest.current = { answer, isAnswering, taskId: pending.taskId, page };
  const answered = useRef<string>();
  useEffect(() => {
    if (!elicitationId) {
      return undefined;
    }
    return listenForElicitationReturn(({ elicitationId: id, nonce }) => {
      if (
        id !== elicitationId ||
        answered.current === elicitationId ||
        latest.current.isAnswering
      ) {
        return;
      }
      const { taskId, page: current } = latest.current;
      void identityApi.getBackstageIdentity().then(({ userEntityRef }) => {
        if (
          answered.current === elicitationId ||
          !takeOpened({
            nonce,
            elicitationId,
            taskId,
            page: current,
            user: userEntityRef,
          })
        ) {
          return;
        }
        answered.current = elicitationId;
        latest.current.answer('approve');
      });
    });
  }, [elicitationId, identityApi]);

  if (!elicitation) {
    return null;
  }
  const host = linkHost(elicitation.url);
  const kind = musterPageKind(elicitation.url, musterPages);
  const returns = Boolean(elicitationId && kind);
  const open = async () => {
    // A page of the configured muster opens without the consent dialog: in a
    // tab opened now, during the click, and pointed at the page once its
    // return and handoff are known.
    const tab = kind ? openBlankTab() : undefined;
    const nonce = newReturnNonce();
    const href = elicitationHref(elicitation.url, {
      musterPages,
      elicitationId,
      nonce,
      back: new URL(page, window.location.origin).toString(),
    });
    // Recorded before the page can return, taken back when the person does
    // not open it.
    let record: OpenedRecord | undefined;
    if (returns && elicitationId) {
      const { userEntityRef } = await identityApi.getBackstageIdentity();
      record = {
        nonce,
        elicitationId,
        taskId: pending.taskId,
        page,
        user: userEntityRef,
      };
      writeOpened([...readOpened(), record]);
    }
    if (tab) {
      const ticket = requestHandoff
        ? await requestHandoff(elicitation.url).catch(() => undefined)
        : undefined;
      tab.location.replace(withHandoff(href, ticket));
      return;
    }
    // Any other link, or a blocked new tab: the consent dialog, whose Open
    // is a click of its own. No handoff: the dialog may wait longer than a
    // ticket lives.
    const consent = await consentApi.open({
      url: href,
      requester: elicitation.server,
      ...(elicitation.message && { message: elicitation.message }),
    });
    if (consent !== 'accept' && record) {
      writeOpened(readOpened().filter(entry => entry.nonce !== nonce));
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
