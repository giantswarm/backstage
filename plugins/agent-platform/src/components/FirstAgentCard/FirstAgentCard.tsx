import { useRouteRef } from '@backstage/frontend-plugin-api';
import { ButtonLink } from '@backstage/ui';
import AddIcon from '@material-ui/icons/Add';
import {
  EmptyStateCard,
  LoadingIndicator,
} from '@giantswarm/backstage-plugin-ui-react';

import { useCreatesAgentsNowhere } from '../../hooks/useAgentManager';
import { ACCESS_GRANT_HINT } from '../../lib/tenants';
import { newAgentRouteRef } from '../../routes';

/**
 * The first-run state of a fleet with no agents on it, shared by the Agents and
 * Sessions tabs so the copy and the route live in one place.
 *
 * Only for a fleet that answered, holds nothing, and has somewhere to deploy to.
 * When the agents could not be read, or no installation in scope runs kagent,
 * inviting the user to create one would send them down the wrong path — the
 * callers decide that, and say so instead.
 *
 * A person agent-manager lets create in no tenant on any of `installations`
 * is not invited: the card says who grants access instead (D6).
 */
export function FirstAgentCard({ installations }: { installations: string[] }) {
  const newAgentLink = useRouteRef(newAgentRouteRef);
  const { createsNowhere, isLoading } = useCreatesAgentsNowhere(installations);

  if (isLoading) {
    return <LoadingIndicator label="Reading where you may create agents…" />;
  }
  if (createsNowhere) {
    return (
      <EmptyStateCard
        title="No agents for you yet"
        description={`No tenant you can use holds an agent, and you may create agents in none. ${ACCESS_GRANT_HINT}`}
      />
    );
  }

  return (
    <EmptyStateCard
      title="No agents yet"
      description="An agent is an assistant with a model, a system prompt and a set of tools, running in a cluster. Create your first one and it is ready to use."
      actions={
        // Unbound when this plugin's Agents tab is disabled, which the Sessions
        // tab -- a separate extension -- can outlive. The card still explains
        // the empty screen; it just has nowhere to send the user, and a button
        // that goes nowhere is worse than none.
        //
        // A link to the create form rather than a button that navigates on
        // press: the browser follows the href however the click arrives, and it
        // opens in a new tab like any other link.
        newAgentLink ? (
          <ButtonLink
            variant="primary"
            iconStart={<AddIcon />}
            href={newAgentLink()}
          >
            Create your first agent
          </ButtonLink>
        ) : undefined
      }
    />
  );
}
