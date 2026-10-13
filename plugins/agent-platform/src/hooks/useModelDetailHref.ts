import { useRouteRef } from '@backstage/frontend-plugin-api';

import { SHELL_CUSTOMIZE_PATH } from '../components/ShellCustomizeRedirect';
import { modelsRouteRef } from '../routes';

/** A ModelConfig's identity: a name is only unique in a namespace on one installation. */
export type ModelDetailParams = {
  installation: string;
  namespace: string;
  name: string;
};

/**
 * One model's page, `/customize/models/<installation>/<namespace>/<name>`:
 * beside the Customize screen's Models tab that lists it, so the app's
 * Customize page routes it (as `ModelDetailPage`), and it is reached by path.
 * The former `/agent-platform/models/<installation>/<namespace>/<name>`
 * redirects here.
 */
export function modelDetailPath({
  installation,
  namespace,
  name,
}: ModelDetailParams): string {
  return `${SHELL_CUSTOMIZE_PATH}/models/${[installation, namespace, name]
    .map(encodeURIComponent)
    .join('/')}`;
}

/**
 * {@link modelDetailPath}, or `undefined` where the Models tab is not mounted
 * (the Agent Platform is off), so a caller renders plain text rather than a
 * link that goes nowhere — what the former route ref's `useRouteRef` gave.
 */
export function useModelDetailHref():
  ((params: ModelDetailParams) => string) | undefined {
  const modelsRoute = useRouteRef(modelsRouteRef);
  return modelsRoute ? modelDetailPath : undefined;
}
