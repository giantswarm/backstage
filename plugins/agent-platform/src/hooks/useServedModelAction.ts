import { useCallback, useMemo } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ModelConfig } from '@giantswarm/backstage-plugin-kubernetes-react';
import { modelManagerApiRef } from '../apis';
import {
  modelManagerJobsQueryKey,
  modelManagerModelsQueryKey,
  modelManagerNodesQueryKey,
} from '../lib/queryKeys';

/**
 * The per-model operations of the model-manager API, as one union. `backend`
 * names the backend the model belongs to, so a model-manager running several
 * (0.17 on) needs no resolving — and cannot mistake a same-named reference on
 * another backend; one running a single backend ignores it.
 */
export type ServedModelAction =
  | { type: 'load'; model: string; backend?: string; keepAlive?: string }
  | { type: 'unload'; model: string; backend?: string }
  | { type: 'delete'; model: string; backend?: string; unwire: boolean }
  | { type: 'wire'; model: string; backend?: string }
  | { type: 'unwire'; model: string; backend?: string };

export const SERVED_MODEL_ACTION_LABEL: Record<
  ServedModelAction['type'],
  string
> = {
  load: 'Load',
  unload: 'Unload',
  delete: 'Delete',
  wire: 'Create model config',
  unwire: 'Remove model config',
};

/**
 * Invalidate every read a model-manager operation can change on an
 * installation: the inventory (loaded state, the model itself), the jobs, and
 * the kagent ModelConfig list the Models table above is built from (wiring
 * creates and removes ModelConfigs behind the portal's back).
 */
export function useInvalidateModelManagerReads(installation: string) {
  const invalidate = useInvalidateModelManagerReadsFor();
  return useCallback(
    () => invalidate(installation),
    [invalidate, installation],
  );
}

/** {@link useInvalidateModelManagerReads} for a caller that names the installation per call. */
export function useInvalidateModelManagerReadsFor() {
  const queryClient = useQueryClient();
  return useCallback(
    async (installation: string) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: modelManagerModelsQueryKey(installation),
        }),
        queryClient.invalidateQueries({
          queryKey: modelManagerJobsQueryKey(installation),
        }),
        queryClient.invalidateQueries({
          queryKey: modelManagerNodesQueryKey(installation),
        }),
        // Same key shape `useDeleteModelConfig` invalidates: the
        // kubernetes-react resource cache for the ModelConfig list and gets.
        ...['list', 'get'].map(operation =>
          queryClient.invalidateQueries({
            queryKey: [
              'cluster',
              installation,
              operation,
              ModelConfig.group,
              ModelConfig.apiVersion,
              ModelConfig.plural,
            ],
          }),
        ),
      ]);
    },
    [queryClient],
  );
}

/**
 * Run one operation on one served model of an installation, through
 * model-manager.
 *
 * One mutation for all five rather than five hooks, because a row does one
 * thing at a time and a single `isPending` is what the menu and the dialog
 * need to lock on. Which operations are *offered* is the caller's decision,
 * from the installation's capability flags — this hook only runs what it is
 * handed, and an operation the backend does not support comes back as the
 * proxy's `ForbiddenError` ("capability not supported").
 *
 * Call this from inside the plugin's `QueryClientProvider`.
 */
export function useServedModelAction(installation: string) {
  const modelManagerApi = useApi(modelManagerApiRef);
  const invalidate = useInvalidateModelManagerReads(installation);

  const mutation = useMutation({
    mutationFn: async (action: ServedModelAction) => {
      const scope = action.backend ? { backend: action.backend } : {};
      switch (action.type) {
        case 'load':
          await modelManagerApi.loadModel(installation, {
            model: action.model,
            ...(action.keepAlive !== undefined && {
              keepAlive: action.keepAlive,
            }),
            ...scope,
          });
          break;
        case 'unload':
          await modelManagerApi.unloadModel(installation, action.model, scope);
          break;
        case 'delete':
          await modelManagerApi.deleteModel(installation, action.model, {
            unwire: action.unwire,
            ...scope,
          });
          break;
        case 'wire':
          await modelManagerApi.wireModel(installation, action.model, scope);
          break;
        case 'unwire':
          await modelManagerApi.unwireModel(installation, action.model, scope);
          break;
        default:
          throw new Error('Unknown served-model action');
      }
    },
    // Refresh whether it succeeded or not: a load that timed out at the proxy
    // may well have completed, and the inventory is the truth.
    onSettled: () => invalidate(),
  });

  const { mutateAsync, reset } = mutation;
  const run = useCallback(
    (action: ServedModelAction) => mutateAsync(action),
    [mutateAsync],
  );

  return useMemo(
    () => ({
      run,
      isPending: mutation.isPending,
      /** The action in flight, so a menu can say which. */
      pendingAction: mutation.isPending ? mutation.variables : undefined,
      error: mutation.error as Error | null,
      reset,
    }),
    [run, mutation.isPending, mutation.variables, mutation.error, reset],
  );
}

export type UseServedModelActionResult = ReturnType<
  typeof useServedModelAction
>;
