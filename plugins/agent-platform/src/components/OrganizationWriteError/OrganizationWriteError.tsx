import { Alert } from '@backstage/ui';

import {
  AgentManagerError,
  AgentManagerNotConnectedError,
} from '../../lib/agentManager';
import { PortalSessionEndedError } from '../../lib/portalSession';
import { ConnectAgentManagerAlert } from '../ConnectAgentManagerAlert';
import { PortalSessionEndedAlert } from '../PortalSessionEndedAlert';

/**
 * Why a write to an organization's objects through agent-manager failed, in
 * words that say what to do: an ended portal session says so, a muster
 * session without agent-manager offers the sign-in, agent-manager's refusal
 * of a person who may not make the change names the organization's admins,
 * and any other failure is said as it came.
 */
export function OrganizationWriteError({
  error,
  installation,
  organization,
  signInAction,
  adminAction,
  title,
  onSignedIn,
}: {
  error: Error;
  installation: string;
  /** The organization the object is in, when it is one's. */
  organization?: string;
  /** What waits for the sign-in, e.g. "An organization's models are saved". */
  signInAction: string;
  /** What only an admin does, e.g. "sets its default model". */
  adminAction: string;
  /** The heading of any other failure. */
  title: string;
  /** Clears the error once the person signed in to agent-manager. */
  onSignedIn: () => void;
}) {
  if (error instanceof PortalSessionEndedError) {
    return <PortalSessionEndedAlert />;
  }
  // The call declares no URL elicitation, so a missing sign-in comes back
  // as this error, with the sign-in offered here.
  if (error instanceof AgentManagerNotConnectedError) {
    return (
      <ConnectAgentManagerAlert
        installation={installation}
        message={error.message}
        action={signInAction}
        signInRequired={error.signInRequired}
        onSignedIn={onSignedIn}
      />
    );
  }
  if (
    organization &&
    error instanceof AgentManagerError &&
    error.code === 'forbidden'
  ) {
    return (
      <Alert
        status="danger"
        title="Not permitted"
        description={`Only an admin of the organization ${organization} ${adminAction}. Ask one of its admins to make the change, or to make you an admin. agent-manager answered: ${error.message}`}
      />
    );
  }
  return <Alert status="danger" title={title} description={error.message} />;
}
