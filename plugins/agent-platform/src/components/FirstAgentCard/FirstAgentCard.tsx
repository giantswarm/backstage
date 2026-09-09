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
 * Only for a fleet that answered and holds nothing. When the agents could not
 * be read, inviting the user to create one would send them down the wrong path
 * — the callers say so instead.
 */
export function FirstAgentCard() {
  const navigate = useNavigate();
  const newAgentLink = useRouteRef(newAgentRouteRef);

  if (!newAgentLink) {
    // Only reachable with the route unbound, which means this plugin's Agents
    // tab is disabled -- and then a card inviting the user there is a dead end.
    return null;
  }

  return (
    <EmptyStateCard
      title="No agents yet"
      description="An agent is an assistant with a model, a system prompt and a set of tools, running on one of your management clusters. Create your first one and it is ready to chat with."
      actions={
        <Button
          variant="primary"
          iconStart={<AddIcon />}
          onPress={() => navigate(newAgentLink())}
        >
          Create your first agent
        </Button>
      }
    />
  );
}
