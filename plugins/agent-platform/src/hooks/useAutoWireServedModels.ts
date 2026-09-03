import { useCallback, useEffect, useRef, useState } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  createResource,
  ModelConfig,
  patchResource,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { buildAutoWireManifests } from '../lib/serveModel';
import type { ServedModel } from '../lib/serving';
import { invalidateResourceReads, SECRET_GVK } from './invalidateResourceReads';

export type WiringState =
  | { status: 'wiring' }
  | { status: 'done' }
  /** The promised ModelConfig exists but points elsewhere; left alone. */
  | { status: 'conflict'; message: string }
  | { status: 'error'; message: string };

/** What the auto-wiring needs to know about a served model: itself, and who already uses it. */
export type AutoWireCandidate = ServedModel & {
  /** ModelConfigs already pointing at this served model. Non-empty = wired. */
  usedBy: unknown[];
};

/**
 * Completes the promise the serve flow made: once an InferenceService the
 * portal created reports Ready, create the kagent ModelConfig (provider
 * OpenAI, base URL = the predictor Service, `/v1`) and its placeholder
 * `OPENAI_API_KEY` Secret, so agents can pick the model right away — the three
 * manual steps with the known traps, as one code path.
 *
 * Runs with the user's own RBAC from whichever session is looking at the
 * Models tab when the model comes up (the Serving table polls the CRs), and is
 * idempotent: the ModelConfig name is deterministic (the annotation on the
 * InferenceService), a 409 on create means another session got there first,
 * and a model that already has a ModelConfig pointing at it is never touched.
 * A same-named ModelConfig that points *elsewhere* is reported, not
 * overwritten — the portal only ever writes objects it owns.
 *
 * Failures are kept per served model and shown in its row; nothing retries in
 * a loop. A reload retries.
 */
export function useAutoWireServedModels(
  candidates: AutoWireCandidate[],
  modelConfigsFor: (installation: string) => ModelConfig[],
  options: {
    /**
     * The ModelConfig lists are still loading. `usedBy` is then empty for
     * every model, which is not the same as "nobody uses it" — so nothing is
     * wired until they have answered (the write is idempotent either way, but
     * a needless 409 and a flash of "Creating model config…" are avoidable).
     */
    modelConfigsLoading?: boolean;
  } = {},
): { wiringFor: (id: string) => WiringState | undefined } {
  const kubernetesApi = useApi(kubernetesApiRef);
  const queryClient = useQueryClient();
  const [states, setStates] = useState<Record<string, WiringState>>({});
  const inFlight = useRef(new Set<string>());

  useEffect(() => {
    const present = new Set(candidates.map(candidate => candidate.id));
    // Forget models that are gone, so a re-served one starts fresh.
    setStates(previous => {
      const kept = Object.fromEntries(
        Object.entries(previous).filter(([id]) => present.has(id)),
      );
      return Object.keys(kept).length === Object.keys(previous).length
        ? previous
        : kept;
    });

    if (options.modelConfigsLoading) {
      return;
    }

    for (const candidate of candidates) {
      const target = candidate.autoWire;
      if (
        !target ||
        candidate.readiness !== 'ready' ||
        candidate.usedBy.length > 0 ||
        inFlight.current.has(candidate.id) ||
        states[candidate.id]
      ) {
        continue;
      }

      const existing = modelConfigsFor(candidate.installation).find(
        modelConfig =>
          modelConfig.getName() === target.name &&
          modelConfig.getNamespace() === target.namespace,
      );
      if (existing) {
        setStates(previous => ({
          ...previous,
          [candidate.id]: {
            status: 'conflict',
            message: `A model config ${target.namespace}/${target.name} already exists and points at ${
              existing.getEndpoint() ?? "its provider's default endpoint"
            }, so it was left alone. Rename or remove it to let this model be wired.`,
          },
        }));
        continue;
      }

      inFlight.current.add(candidate.id);
      setStates(previous => ({
        ...previous,
        [candidate.id]: { status: 'wiring' },
      }));

      const { secret, modelConfig } = buildAutoWireManifests(candidate, target);
      const cluster = candidate.installation;
      (async () => {
        // Secret first, so the controller's first look at the ModelConfig
        // resolves the reference. Patch-or-create mirrors `kubectl apply`.
        try {
          await patchResource({
            kubernetesApi,
            cluster,
            gvk: SECRET_GVK,
            name: secret.name,
            namespace: target.namespace,
            patch: secret.patch,
          });
        } catch (error) {
          if ((error as Error).name !== 'NotFoundError') {
            throw error;
          }
          await createResource({
            kubernetesApi,
            cluster,
            gvk: SECRET_GVK,
            namespace: target.namespace,
            manifest: secret.manifest,
          });
        }
        try {
          await createResource({
            kubernetesApi,
            cluster,
            gvk: ModelConfig.getGVK(),
            namespace: target.namespace,
            manifest: modelConfig,
          });
        } catch (error) {
          // Another session wired it between our read and our write.
          if ((error as Error).name !== 'ConflictError') {
            throw error;
          }
        }
        await invalidateResourceReads(queryClient, cluster, [
          ModelConfig.getGVK(),
          SECRET_GVK,
        ]);
      })()
        .then(() => {
          setStates(previous => ({
            ...previous,
            [candidate.id]: { status: 'done' },
          }));
        })
        .catch((error: Error) => {
          setStates(previous => ({
            ...previous,
            [candidate.id]: {
              status: 'error',
              message: `The model config could not be created: ${error.message}`,
            },
          }));
        })
        .finally(() => {
          inFlight.current.delete(candidate.id);
        });
    }
  }, [
    candidates,
    modelConfigsFor,
    states,
    kubernetesApi,
    queryClient,
    options.modelConfigsLoading,
  ]);

  const wiringFor = useCallback((id: string) => states[id], [states]);

  return { wiringFor };
}
