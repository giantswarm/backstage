import { useRouteRef } from '@backstage/frontend-plugin-api';
import { ButtonLink } from '@backstage/ui';
import { PLATFORM_COMPONENT_LABELS } from '@giantswarm/backstage-plugin-gs';
import { EmptyStateCard } from '@giantswarm/backstage-plugin-ui-react';

import { installationsExternalRouteRef } from '../../routes';

export type KagentMissingCardProps = {
  /** The environments in scope, each answered without kagent. */
  installations: string[];
  /** Another environment runs kagent, so the Environment select is a way out. */
  canChooseAnother: boolean;
};

/**
 * What {@link KagentMissingCard} says: the title naming where kagent is
 * missing, and the remedy. Shared with the Customize header's disabled New
 * agent action, so the reason on the button and the card under it agree.
 */
export function describeKagentMissing({
  installations,
  canChooseAnother,
}: KagentMissingCardProps): { title: string; remedy: string } {
  const kagent = PLATFORM_COMPONENT_LABELS.kagent;
  const [installation] = installations;
  if (installations.length === 1 && canChooseAnother) {
    return {
      title: `${kagent} is not installed on ${installation}`,
      remedy: `Choose another environment, or enable the Agent Platform on ${installation}.`,
    };
  }
  if (installations.length === 1) {
    return {
      title: `${kagent} is not installed on ${installation}`,
      remedy: `Enable the Agent Platform on ${installation} to create agents there.`,
    };
  }
  return {
    title: `${kagent} is not installed on any environment`,
    remedy:
      'Enable the Agent Platform on one of your environments to create agents.',
  };
}

/**
 * The environments in scope answered their inventory probe without kagent:
 * no agent can be listed or created there. Says so in place of an empty list,
 * and points to the Installations page, where the Agent Platform is enabled.
 */
export function KagentMissingCard(props: KagentMissingCardProps) {
  const installationsLink = useRouteRef(installationsExternalRouteRef);
  const { title, remedy } = describeKagentMissing(props);

  return (
    <EmptyStateCard
      title={title}
      description={`Agents run on environments with ${PLATFORM_COMPONENT_LABELS.kagent}. ${remedy}`}
      actions={
        // Unbound when the gs plugin's Installations page is not installed:
        // the card still explains the empty list, without a dead link.
        installationsLink ? (
          <ButtonLink variant="secondary" href={installationsLink()}>
            Go to Installations
          </ButtonLink>
        ) : undefined
      }
    />
  );
}
