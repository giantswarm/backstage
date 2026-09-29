import { Button, CircularProgress } from '@material-ui/core';
import Lock from '@material-ui/icons/Lock';
import { Gate } from '@giantswarm/backstage-plugin-ui-react';
import type { MusterSession } from '../MusterInstanceProvider/useMusterSession';
import { sessionGateCopy } from '../MusterInstanceProvider/sessionCopy';

export interface SessionGateProps {
  session: MusterSession;
  /** Names the installation in the "checking" copy; failures name it themselves. */
  installation?: string;
  /**
   * What is gated and why, leading the sentence -- e.g. "Server topology is
   * visible from the CRDs; tools and core families need a live muster session."
   */
  context?: string;
}

/**
 * The auth gate for content that needs a live muster session, worded per
 * failure class (see `useMusterSession().failure`): a gone portal session
 * offers "Sign in again" (the single main re-login), a failed mint or a
 * rejection by muster quotes the cause and offers a retry, and the first probe
 * shows a neutral "checking" state with no button at all.
 */
export function SessionGate({
  session,
  installation,
  context,
}: SessionGateProps) {
  const copy = sessionGateCopy(session, installation);
  const label = context ? `${context} ${copy.sentence}` : copy.sentence;
  return (
    <Gate
      label={label}
      action={
        copy.action ? (
          <Button
            size="small"
            variant="contained"
            color="primary"
            disabled={session.connecting}
            startIcon={
              session.connecting ? (
                <CircularProgress size={14} color="inherit" />
              ) : (
                <Lock style={{ fontSize: 14 }} />
              )
            }
            onClick={session.connect}
          >
            {session.connecting ? 'Connecting…' : copy.action}
          </Button>
        ) : undefined
      }
    />
  );
}
