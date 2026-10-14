import { useMemo } from 'react';
import { useRouteRef } from '@backstage/frontend-plugin-api';

import { customizeExternalRouteRef } from '../routes';

/** A ModelConfig's identity: a name is only unique in a namespace on one installation. */
export type ModelDetailParams = {
  installation: string;
  namespace: string;
  name: string;
};

/**
 * One model's page, `<customize>/models/<installation>/<namespace>/<name>`,
 * beside the Customize screen's Models tab that lists it. `customize` is the
 * Customize page's path as the app binds it (see {@link useCustomizePaths}).
 */
export function modelDetailPath(
  customize: string,
  { installation, namespace, name }: ModelDetailParams,
): string {
  return `${customize}/models/${[installation, namespace, name]
    .map(encodeURIComponent)
    .join('/')}`;
}

export type CustomizePaths = {
  /** The Customize screen. */
  customize?: string;
  /** Its Models tab. */
  models?: string;
  /** One model's page, beside the Models tab. */
  modelDetail?: (params: ModelDetailParams) => string;
};

/**
 * The shell's Customize screen and the pages agent-platform has under it,
 * resolved through the `customize` external route the app binds to its
 * Customize page (`customizeExternalRouteRef`), as muster's own `customize`
 * route is. The page belongs to the app, so no plugin can name it as a
 * default target; resolving it, rather than hard-coding `/customize`, keeps
 * the links on the real page under any base path. Every path is `undefined`
 * where the app binds nothing, so callers render plain text rather than a
 * link that goes nowhere.
 */
export function useCustomizePaths(): CustomizePaths {
  const customizeRoute = useRouteRef(customizeExternalRouteRef);
  const customize = customizeRoute?.();
  return useMemo(
    () =>
      customize === undefined
        ? {}
        : {
            customize,
            models: `${customize}/models`,
            modelDetail: (params: ModelDetailParams) =>
              modelDetailPath(customize, params),
          },
    [customize],
  );
}
