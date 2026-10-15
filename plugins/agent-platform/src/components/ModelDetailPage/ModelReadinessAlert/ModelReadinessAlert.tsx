import { Alert, ButtonLink } from '@backstage/ui';
import { ModelConfig } from '@giantswarm/backstage-plugin-kubernetes-react';

/**
 * Why the model is not accepted yet, in the controller's words — on every
 * tab, because it is true on every tab, as the agent page's
 * `AgentSessionBlocker` says why an agent that is not ready cannot start
 * sessions. A model the controller rejected is a danger alert; one it has
 * not reported on yet is an info alert. Elsewhere than Details it links
 * there, where Technical details open on arrival with the conditions.
 */
export function ModelReadinessAlert({
  modelConfig,
  detail,
  detailsHref,
}: {
  modelConfig: ModelConfig;
  /**
   * The status's explanation (`modelStatus(…).detail`): the controller's
   * message, or why a stale status is pending.
   */
  detail: string | undefined;
  /**
   * The Details tab. Absent while it is the open tab: the alert then keeps to
   * its title, since the open Technical details below say the rest.
   */
  detailsHref?: string;
}) {
  const readiness = modelConfig.getReadiness();
  if (readiness === 'accepted') {
    return null;
  }

  const isRejected = readiness === 'notAccepted';
  const fallback = isRejected
    ? 'Its conditions in Technical details say why.'
    : 'The controller has not reported on this model yet.';

  return (
    <Alert
      status={isRejected ? 'danger' : 'info'}
      icon
      title={
        isRejected
          ? 'kagent did not accept this model'
          : 'kagent has not accepted this model yet'
      }
      description={detailsHref ? (detail ?? fallback) : undefined}
      customActions={
        detailsHref ? (
          <ButtonLink size="small" variant="secondary" href={detailsHref}>
            Show conditions
          </ButtonLink>
        ) : undefined
      }
    />
  );
}
