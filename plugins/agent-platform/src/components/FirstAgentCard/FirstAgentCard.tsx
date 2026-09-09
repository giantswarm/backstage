import { useNavigate } from 'react-router-dom';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Button } from '@backstage/ui';
import AddIcon from '@material-ui/icons/Add';
import { EmptyStateCard } from '@giantswarm/backstage-plugin-ui-react';

import { newAgentRouteRef } from '../../routes';

/**
 * The first-run state of a fleet with no agents on it, shared by the Agents and
 * Sessions tabs so the copy and the route live in one place.
 *
 * Only for a fleet that answered, holds nothing, and has somewhere to deploy to.
 * When the agents could not be read, or no installation in scope runs kagent,
 * inviting the user to create one would send them down the wrong path — the
 * callers decide that, and say so instead.
 */
export function FirstAgentCard() {
  const navigate = useNavigate();
  const newAgentLink = useRouteRef(newAgentRouteRef);

  return (
    <EmptyStateCard
      title="No agents yet"
      description="An agent is an assistant with a model, a system prompt and a set of tools, running in a cluster. Create your first one and it is ready to use."
      actions={
        // Unbound when this plugin's Agents tab is disabled, which the Sessions
        // tab -- a separate extension -- can outlive. The card still explains
        // the empty screen; it just has nowhere to send the user, and a button
        // that goes nowhere is worse than none.
        newAgentLink ? (
          <Button
            variant="primary"
            iconStart={<AddIcon />}
            onPress={() => navigate(newAgentLink())}
          >
            Create your first agent
          </Button>
        ) : undefined
      }
    />
  );
}
