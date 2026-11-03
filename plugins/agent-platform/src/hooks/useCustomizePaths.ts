import { useMemo } from 'react';
import { useRouteRef } from '@backstage/frontend-plugin-api';

import {
  agentsRouteRef,
  customizeExternalRouteRef,
  modelDetailRouteRef,
  modelsRouteRef,
  skillsRouteRef,
  workspacesRouteRef,
} from '../routes';

/** A ModelConfig's identity: a name is only unique in a namespace on one installation. */
export type ModelDetailParams = {
  installation: string;
  namespace: string;
  name: string;
};

export type CustomizePaths = {
  /** The Customize screen. */
  customize?: string;
  /** Its Agents tab. */
  agents?: string;
  /** Its Skills tab. */
  skills?: string;
  /** Its Connectors tab. */
  connectors?: string;
  /** Its Models tab. */
  models?: string;
  /** Its Workflows tab. */
  workflows?: string;
  /** Its Workspaces tab. */
  workspaces?: string;
  /** One model's page, under the Models tab. */
  modelDetail?: (params: ModelDetailParams) => string;
};

/**
 * The shell's Customize screen and its tabs. The Agents, Skills, Models and
 * Workspaces tabs are this plugin's own routes (sub-pages of the Customize page, their
 * lists at the bare path); the screen itself, and muster's Connectors and
 * Workflows tabs on it, resolve through the `customize` external route the
 * app binds to its Customize page (`customizeExternalRouteRef`), as muster's
 * own `customize` route is. Resolving them, rather than hard-coding
 * `/customize`, keeps the links on the real page under any base path. Every
 * path is `undefined` where it does not resolve, so callers render plain
 * text rather than a link that goes nowhere.
 */
export function useCustomizePaths(): CustomizePaths {
  const customizeRoute = useRouteRef(customizeExternalRouteRef);
  const agentsRoute = useRouteRef(agentsRouteRef);
  const skillsRoute = useRouteRef(skillsRouteRef);
  const modelsRoute = useRouteRef(modelsRouteRef);
  const workspacesRoute = useRouteRef(workspacesRouteRef);
  const modelDetailRoute = useRouteRef(modelDetailRouteRef);
  const customize = customizeRoute?.();
  const agents = agentsRoute?.();
  const skills = skillsRoute?.();
  const models = modelsRoute?.();
  const workspaces = workspacesRoute?.();
  return useMemo(
    () => ({
      customize,
      agents,
      skills,
      models,
      connectors: customize && `${customize}/connectors`,
      workflows: customize && `${customize}/workflows`,
      workspaces,
      modelDetail: modelDetailRoute,
    }),
    [customize, agents, skills, models, workspaces, modelDetailRoute],
  );
}
