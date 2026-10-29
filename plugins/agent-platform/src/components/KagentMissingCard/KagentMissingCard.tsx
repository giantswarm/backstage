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
 * The environments in scope answered their inventory probe without kagent:
 * no agent can be listed or created there. Says so in place of an empty list,
 * and points to the Installations page, where the Agent Platform is enabled.
 * A portal without that page names who enables it instead.
 */
export function KagentMissingCard({
  installations,
  canChooseAnother,
}: KagentMissingCardProps) {
  const installationsLink = useRouteRef(installationsExternalRouteRef);
  const kagent = PLATFORM_COMPONENT_LABELS.kagent;
  const [installation] = installations;
  // Without the Installations page the person cannot enable it here.
  const enable = installationsLink
    ? 'enable the Agent Platform'
    : 'ask your platform team to enable the Agent Platform';
  const Enable = enable.charAt(0).toUpperCase() + enable.slice(1);

  let title: string;
  let remedy: string;
  if (installations.length === 1 && canChooseAnother) {
    title = `${kagent} is not installed on ${installation}`;
    remedy = `Choose another environment, or ${enable} on ${installation}.`;
  } else if (installations.length === 1) {
    title = `${kagent} is not installed on ${installation}`;
    remedy = `${Enable} on ${installation} to create agents there.`;
  } else {
    title = `${kagent} is not installed on any environment`;
    remedy = `${Enable} on one of your environments to create agents.`;
  }

  return (
    <EmptyStateCard
      title={title}
      description={`Agents run on environments with ${kagent}. ${remedy}`}
      actions={
        // Unbound when the gs plugin's Installations page is not installed:
        // the remedy names the platform team, without a dead link.
        installationsLink ? (
          <ButtonLink variant="secondary" href={installationsLink()}>
            Go to Installations
          </ButtonLink>
        ) : undefined
      }
    />
  );
}
