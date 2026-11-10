import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Text } from '@backstage/ui';

import { servingRouteRef } from '../../routes';
import { useServing } from '../ServingProvider';
import { useModelHosting } from '../../hooks/useModelHosting';
import { ExternalLink } from '@giantswarm/backstage-plugin-ui-react';

/**
 * Where the portal's configuration reference says what model hosting needs:
 * model-manager registered with the installation's muster.
 */
export const MODEL_HOSTING_DOCS_URL =
  'https://github.com/giantswarm/backstage/blob/main/docs/agent-platform-configuration.md#agent-creation-models-connectors-and-workflows-muster';

/**
 * The counterpart of the Model hosting entry on Customize → Models: where
 * Model hosting is not offered (`useModelHosting`: no environment in scope
 * has a serving layer or cluster-manager), one quiet line says what turns it
 * on. Says nothing while that is still being read, when it is offered (the
 * entry takes over), or when this app mounts no Model hosting page. Must be
 * mounted inside a `ServingProvider` and the plugin's QueryClientProvider.
 */
export function ModelHostingHint() {
  const servingRoute = useRouteRef(servingRouteRef);
  const hosting = useModelHosting(useServing());
  if (!servingRoute || hosting.isLoading || hosting.available) {
    return null;
  }
  return (
    <Text as="p" variant="body-small" color="secondary">
      Model hosting — running models on your own GPUs — appears here once an
      environment runs model-manager, registered with its muster.{' '}
      <ExternalLink href={MODEL_HOSTING_DOCS_URL} display="inline">
        How to turn it on
      </ExternalLink>
    </Text>
  );
}
