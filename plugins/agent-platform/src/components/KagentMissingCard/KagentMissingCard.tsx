import { useRouteRef } from '@backstage/frontend-plugin-api';
import { ButtonLink } from '@backstage/ui';
import { PLATFORM_COMPONENT_LABELS } from '@giantswarm/backstage-plugin-gs';
import { EmptyStateCard } from '@giantswarm/backstage-plugin-ui-react';

import { installationsExternalRouteRef } from '../../routes';

/**
 * The pinned installation answered its inventory probe without kagent: no
 * agent can be listed or created there. Says so in place of an empty table,
 * and points to where the Agent Platform is enabled.
 */
export function KagentMissingCard({ installation }: { installation: string }) {
  const installationsLink = useRouteRef(installationsExternalRouteRef);
  const kagent = PLATFORM_COMPONENT_LABELS.kagent;

  return (
    <EmptyStateCard
      title={`${kagent} is not installed on ${installation}`}
      description={`Agents run on installations with ${kagent}. Choose another installation above, or enable the Agent Platform on ${installation}.`}
      actions={
        installationsLink ? (
          <ButtonLink variant="secondary" href={installationsLink()}>
            Go to Installations
          </ButtonLink>
        ) : undefined
      }
    />
  );
}
