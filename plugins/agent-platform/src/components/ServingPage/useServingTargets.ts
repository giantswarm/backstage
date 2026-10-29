import { useCallback, useMemo } from 'react';

import { useMusterPluginApi } from '../../hooks/useMusterPluginApi';
import {
  NO_SERVING_CAPABILITIES,
  type ServingBackend,
  type ServingCapabilities,
} from '../../lib/serving';
import type {
  ImportTarget,
  LoadTarget,
  PullTarget,
} from '../ModelManagerControls';
import { useServing } from '../ServingProvider';

export type ServingTargets = {
  /**
   * The flags a row's controls follow: its backend's on its installation (an
   * installation may run several behind one model-manager), else the
   * installation's.
   */
  capabilitiesFor: (
    installation: string,
    backend?: ServingBackend,
  ) => ServingCapabilities;
  /** Where Pull model pulls: backends that pull by reference but cannot search. */
  pullTargets: PullTarget[];
  /** Where Import from Hugging Face imports: backends that search and pull. */
  importTargets: ImportTarget[];
  /**
   * Where Serve model serves: every backend that can load — on a GPU pool the
   * kserve backend the pool registered — reached over muster as the person.
   */
  loadTargets: LoadTarget[];
};

/**
 * The backends the Serving view's create flows address, from the serving
 * snapshot (`useServing`): shared by the view, which offers a flow where it
 * has a target, and by the flow's own page, which offers the targets. Every
 * choice keys off the installation's `ServingCapabilities`, never off a
 * backend's name. Must be mounted inside a ServingProvider.
 */
export function useServingTargets(): ServingTargets {
  const serving = useServing();
  const { installations } = serving;

  const capabilitiesFor = useCallback(
    (installation: string, backend?: ServingBackend): ServingCapabilities =>
      (backend
        ? serving.backendCapabilities?.[installation]?.[backend]
        : undefined) ??
      serving.capabilities?.[installation] ??
      NO_SERVING_CAPABILITIES,
    [serving.capabilities, serving.backendCapabilities],
  );

  /**
   * The backends an installation's controls address: each named backend of
   * a model-manager that runs several (with its own flags), else the
   * installation as one unnamed target with its merged flags.
   */
  const backendTargetsOf = useCallback(
    (
      installation: string,
    ): { backend?: ServingBackend; capabilities: ServingCapabilities }[] => {
      const perBackend = serving.backendCapabilities?.[installation];
      const named = perBackend
        ? (Object.entries(perBackend) as [
            ServingBackend,
            ServingCapabilities,
          ][])
        : [];
      if (named.length > 1) {
        return named.map(([backend, capabilities]) => ({
          backend,
          capabilities,
        }));
      }
      return [{ capabilities: capabilitiesFor(installation) }];
    },
    [serving.backendCapabilities, capabilitiesFor],
  );

  // A backend that can search its hub gets the import (search, fit check,
  // pre-warm); one that can only pull by reference gets the plain pull.
  const pullTargets = useMemo<PullTarget[]>(
    () =>
      installations.flatMap(installation =>
        backendTargetsOf(installation)
          .filter(
            ({ capabilities }) => capabilities.pull && !capabilities.search,
          )
          .map(({ backend, capabilities }) => ({
            name: installation,
            ...(backend ? { backend } : {}),
            canWire: capabilities.wire,
          })),
      ),
    [installations, backendTargetsOf],
  );
  const importTargets = useMemo<ImportTarget[]>(
    () =>
      installations.flatMap(installation =>
        backendTargetsOf(installation)
          .filter(
            ({ capabilities }) => capabilities.pull && capabilities.search,
          )
          .map(({ backend }) => ({
            name: installation,
            ...(backend ? { backend } : {}),
            nodes: serving.gpuNodes.filter(
              node =>
                node.installation === installation &&
                (!backend || !node.backend || node.backend === backend),
            ),
          })),
      ),
    [installations, backendTargetsOf, serving.gpuNodes],
  );

  const musterApi = useMusterPluginApi();
  const loadTargets = useMemo<LoadTarget[]>(
    () =>
      musterApi
        ? installations.flatMap(installation =>
            backendTargetsOf(installation)
              .filter(({ capabilities }) => capabilities.load)
              .map(({ backend, capabilities }) => ({
                name: installation,
                ...(backend ? { backend } : {}),
                capabilities,
              })),
          )
        : [],
    [musterApi, installations, backendTargetsOf],
  );

  return { capabilitiesFor, pullTargets, importTargets, loadTargets };
}
