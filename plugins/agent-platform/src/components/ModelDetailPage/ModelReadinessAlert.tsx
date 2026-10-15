import { Alert, ButtonLink } from '@backstage/ui';
import { ModelConfig } from '@giantswarm/backstage-plugin-kubernetes-react';

import { STALE_MODEL_DETAIL } from '../../lib/customize';

/**
 * Why the model is not accepted yet, in the controller's words — on every
 * tab, because it is true on every tab, as the agent page's
 * `AgentSessionBlocker` says why an agent that is not ready cannot start
 * sessions. A model the controller rejected is a danger alert; one it has
 * not reported on yet is an info alert. Both link to the Details tab, whose
 * Technical details open on arrival with the conditions.
 */
export function ModelReadinessAlert({
  modelConfig,
  detailsHref,
}: {
  modelConfig: ModelConfig;
  /** The Details tab; absent while it is the open tab. */
  detailsHref?: string;
}) {
  const readiness = modelConfig.getReadiness();
  if (readiness === 'accepted') {
    return null;
  }

  const action = detailsHref ? (
    <ButtonLink size="small" variant="secondary" href={detailsHref}>
      Show conditions
    </ButtonLink>
  ) : undefined;

  if (readiness === 'notAccepted') {
    return (
      <Alert
        status="danger"
        icon
        title="kagent did not accept this model"
        description={
          modelConfig.getReadinessMessage() ??
          'Its conditions in Technical details say why.'
        }
        customActions={action}
      />
    );
  }

  return (
    <Alert
      status="info"
      icon
      title="kagent has not accepted this model yet"
      description={
        // A stale status is pending for that reason alone; its conditions,
        // and so their message, describe the previous spec.
        modelConfig.isStale()
          ? STALE_MODEL_DETAIL
          : (modelConfig.getReadinessMessage() ??
            'The controller has not reported on this model yet.')
      }
      customActions={action}
    />
  );
}
