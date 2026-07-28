import { useApi } from '@backstage/core-plugin-api';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FluxObject,
  RECONCILE_REQUESTED_AT_ANNOTATION,
} from '../../lib/k8s/FluxObject';
import { patchResource } from '../utils/patchResource';
import { useSelfSubjectAccessReview } from '../useSelfSubjectAccessReview';

/**
 * Reconcile and suspend/resume for a single Flux resource, plus the permission
 * check that decides whether to offer them at all.
 *
 * Both actions are a JSON merge patch, which maps to the RBAC verb `patch`, so
 * one access review gates both.
 */
export function useFluxResourceActions(
  resource: FluxObject,
  options: { enabled?: boolean } = {},
) {
  const kubernetesApi = useApi(kubernetesApiRef);
  const queryClient = useQueryClient();

  const cluster = resource.cluster;
  const name = resource.getName();
  const namespace = resource.getNamespace();
  const gvk = resource.getResolvedGVK();

  const { allowed: canPatch, isLoading: isCheckingPermission } =
    useSelfSubjectAccessReview(
      cluster,
      {
        group: gvk.group,
        resource: gvk.plural,
        namespace,
        verb: 'patch',
      },
      { enabled: options.enabled },
    );

  const invalidateReads = async () => {
    // Built from the resolved GVK so they match the keys the read hooks
    // registered. Invalidate rather than write the cache directly: the
    // QueryClient is persisted to localStorage, so a stale pre-mutation object
    // could otherwise be rehydrated on reload.
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: [
          'cluster',
          cluster,
          'list',
          gvk.group,
          gvk.apiVersion,
          gvk.plural,
        ].filter(Boolean),
      }),
      queryClient.invalidateQueries({
        queryKey: [
          'cluster',
          cluster,
          'get',
          gvk.group,
          gvk.apiVersion,
          gvk.plural,
          namespace,
          name,
        ].filter(Boolean),
      }),
    ]);
  };

  const patch = (body: object) =>
    patchResource({
      kubernetesApi,
      cluster,
      gvk,
      name,
      namespace,
      patch: body,
    });

  const reconciliationMutation = useMutation({
    mutationFn: () =>
      patch({
        metadata: {
          annotations: {
            [RECONCILE_REQUESTED_AT_ANNOTATION]: new Date().toISOString(),
          },
        },
      }),
    onSuccess: invalidateReads,
  });

  const suspensionMutation = useMutation({
    mutationFn: (suspend: boolean) => patch({ spec: { suspend } }),
    onSuccess: invalidateReads,
  });

  return {
    canPatch,
    isCheckingPermission,
    requestReconciliation: () => reconciliationMutation.mutateAsync(),
    setSuspended: (suspend: boolean) => suspensionMutation.mutateAsync(suspend),
    isRequestingReconciliation: reconciliationMutation.isPending,
    isSettingSuspended: suspensionMutation.isPending,
  };
}
