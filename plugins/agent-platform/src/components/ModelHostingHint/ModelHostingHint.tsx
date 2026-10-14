import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Link, Text } from '@backstage/ui';

import { servingRouteRef } from '../../routes';
import { hasServingLayer, useServing } from '../ServingProvider';

/**
 * Where the portal's configuration reference says what model hosting needs:
 * model-manager registered with the installation's muster.
 */
export const MODEL_HOSTING_DOCS_URL =
  'https://github.com/giantswarm/backstage/blob/main/docs/agent-platform-configuration.md#agent-creation-models-connectors-and-workflows-muster';

/**
 * The counterpart of the Model hosting entry on Customize → Models: when no
 * environment in scope has a serving layer (no model-manager answers through
 * muster), one quiet line says what turns model hosting on. Says nothing while
 * the serving layer is still being read, when one is there (the entry takes
 * over), or when this app mounts no Model hosting page. Must be mounted inside
 * a `ServingProvider`.
 */
export function ModelHostingHint() {
  const servingRoute = useRouteRef(servingRouteRef);
  const serving = useServing();
  if (!servingRoute || serving.isLoading || hasServingLayer(serving)) {
    return null;
  }
  return (
    <Text as="p" variant="body-small" color="secondary">
      Model hosting — running models on your own GPUs — appears here once an
      environment runs model-manager, registered with its muster.{' '}
      <Link href={MODEL_HOSTING_DOCS_URL} target="_blank" rel="noopener">
        How to turn it on
      </Link>
    </Text>
  );
}
