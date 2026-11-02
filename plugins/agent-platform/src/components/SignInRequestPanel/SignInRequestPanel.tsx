import { Alert, Button, ButtonLink, Flex, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import LockOpenIcon from '@material-ui/icons/LockOpen';

import type { ConfirmationAnswer } from '../../hooks/useAnswerConfirmation';
import type { PendingConfirmation } from '../../lib/kagentHitl';
import {
  ConnectorSignInAction,
  useConnectorSignInLink,
} from '../ConnectorSignInLinks';

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
  quote: {
    margin: 0,
    paddingLeft: theme.spacing(1.5),
    borderLeft: '3px solid var(--bui-border-1, #e0e0e0)',
    overflowWrap: 'anywhere',
  },
}));

export type SignInRequestPanelProps = {
  pending: PendingConfirmation;
  isAnswering: boolean;
  error?: string;
  onAnswer: (answer: ConfirmationAnswer) => void;
};

/**
 * An MCP server's sign-in the agent waits on (`pending.asks === 'sign-in'`):
 * the server that asked, its own words, and the link. muster names itself as
 * the server for every backend behind it, so what needs the sign-in is only
 * in its message, which is quoted as the server's, never as the portal's.
 *
 * Inside a session, the link is the session's connector sign-in
 * (`ConnectorSignInLinks`): it returns to this page once signed in and the
 * agent continues on its own. Elsewhere, the person says when they are done.
 * *Not now* declines: the agent goes on without the call.
 */
export function SignInRequestPanel({
  pending,
  isAnswering,
  error,
  onAnswer,
}: SignInRequestPanelProps) {
  const classes = useStyles();
  const signIn = pending.signIn;
  const link = useConnectorSignInLink(signIn?.url);
  if (!signIn) {
    return null;
  }
  const answer = (decision: ConfirmationAnswer['decision']) =>
    onAnswer({
      taskId: pending.taskId,
      decision,
      text: decision === 'approve' ? "I've signed in." : 'Not now.',
      ...(pending.askedIn && { askedIn: pending.askedIn }),
    });

  return (
    <section
      aria-label="Sign-in request"
      className={classes.card}
      data-testid="sign-in-card"
    >
      <div className={classes.header}>
        <LockOpenIcon aria-hidden fontSize="small" />
        <Flex direction="column" gap="1" style={{ flex: 1, minWidth: 0 }}>
          <Text variant="body-medium" weight="bold">
            {signIn.server} asks you to sign in so the agent can continue
          </Text>
          {signIn.message && (
            <Text as="p" variant="body-medium" className={classes.quote}>
              {signIn.message}
            </Text>
          )}
        </Flex>
      </div>
      {error && (
        <Alert status="danger" title="Answer not sent" description={error} />
      )}
      <Flex align="center" gap="2" style={{ flexWrap: 'wrap' }}>
        {link ? (
          <ConnectorSignInAction link={link} />
        ) : (
          <>
            <ButtonLink
              href={signIn.url}
              target="_blank"
              rel="noopener noreferrer"
              variant="primary"
              size="small"
            >
              Sign in ↗
            </ButtonLink>
            <Button
              variant="secondary"
              size="small"
              isDisabled={isAnswering}
              onPress={() => answer('approve')}
            >
              I've signed in
            </Button>
          </>
        )}
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
