import { useCallback, useMemo } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CustomResourceMatcher,
  deleteResource,
  HelmRelease,
  OCIRepository,
  useResource,
  useSelfSubjectAccessReview,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { getDeploymentOwner } from '../../utils/getDeploymentOwner';

/**
 * Deleting one app deployment, and the checks that decide whether to offer it.
 *
 * Two gates decide the affordance: nothing else may own the HelmRelease (a Flux
 * Kustomization or a parent Helm release would re-create it), and the cluster
 * must say this user may delete it (`SelfSubjectAccessReview`, which decides
 * what is *shown* — authorization stays the apiserver's, since the proxy
 * forwards the user's own OIDC token).
 *
 * The chart's `OCIRepository` rides along only when it is the one this
 * deployment owns: same name and namespace as the HelmRelease, which is the
 * shape the portal's own deploy flow creates and the same rule that decides
 * whether the deployment is editable. A source under any other name may feed
 * other releases, so it stays. That step is best effort, because the release is
 * already gone by then and a leftover OCIRepository is inert.
 *
 * The `valuesFrom` ConfigMaps and Secrets always stay. Their names come from
 * the deploy template, which lives outside this repo, so the portal cannot tell
 * a per-release values object from one that several releases share. The dialog
 * says so.
 */
export function useDeleteDeployment(
  deployment: HelmRelease | undefined,
  installationName: string,
) {
  const kubernetesApi = useApi(kubernetesApiRef);
  const queryClient = useQueryClient();

  const name = deployment?.getName();
  const namespace = deployment?.getNamespace();
  const owner = deployment ? getDeploymentOwner(deployment) : undefined;

  const chartRef = deployment?.getChartRef();
  // Only a source this deployment owns is a candidate, so a foreign one is not
  // even read.
  const ownsChartSource =
    chartRef?.kind === 'OCIRepository' &&
    chartRef.name === name &&
    chartRef.namespace === namespace;

  const { resource: ociRepository } = useResource(
    installationName,
    OCIRepository,
    { name: name ?? '', namespace: namespace ?? '' },
    { enabled: Boolean(deployment) && ownsChartSource },
  );

  const { allowed: isAllowed, isLoading: isCheckingPermission } =
    useSelfSubjectAccessReview(
      installationName,
      {
        group: HelmRelease.group,
        resource: HelmRelease.plural,
        namespace,
        // Named, so a grant restricted via `resourceNames` answers accurately.
        name,
        verb: 'delete',
      },
      { enabled: Boolean(deployment) },
    );

  const invalidateReads = async (gvks: CustomResourceMatcher[]) => {
    await Promise.all(
      gvks.flatMap(gvk =>
        ['list', 'get'].map(operation =>
          queryClient.invalidateQueries({
            queryKey: [
              'cluster',
              installationName,
              operation,
              gvk.group,
              gvk.apiVersion,
              gvk.plural,
            ].filter(Boolean),
          }),
        ),
      ),
    );
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (!deployment || !name) {
        throw new Error(
          'The deployment could not be read, so it cannot be deleted from here. Try reloading the page.',
        );
      }

      const gvk = deployment.getResolvedGVK();
      try {
        await deleteResource({
          kubernetesApi,
          cluster: installationName,
          gvk,
          name,
          namespace,
        });
      } catch (error) {
        // Already gone — someone else deleted it, or an earlier attempt got
        // further than its error suggested. Either way the goal is met.
        if ((error as Error).name !== 'NotFoundError') {
          throw error;
        }
      }

      const invalidated = [gvk];

      if (ociRepository) {
        const ociGVK = ociRepository.getResolvedGVK();
        try {
          await deleteResource({
            kubernetesApi,
            cluster: installationName,
            gvk: ociGVK,
            name,
            namespace,
          });
          invalidated.push(ociGVK);
        } catch {
          // Keep the OCIRepository.
        }
      }

      await invalidateReads(invalidated);
    },
  });

  const { mutateAsync, reset } = mutation;
  const deleteDeployment = useCallback(async () => {
    await mutateAsync();
  }, [mutateAsync]);

  return useMemo(
    () => ({
      /** Whether to offer the deletion at all. */
      isDeletable: Boolean(deployment) && !owner && isAllowed,
      /** Still establishing the above. Withhold the affordance rather than guess. */
      isCheckingDeletable: Boolean(deployment) && isCheckingPermission,
      /**
       * The tool that owns the deployment (`'Flux'`, `'Helm'`, …), when that is
       * what withholds the affordance — for the caller to explain.
       */
      owner,
      /** Whether the chart's `OCIRepository` is deleted along with the release. */
      deletesChartSource: Boolean(ociRepository),
      deleteDeployment,
      isDeleting: mutation.isPending,
      error: mutation.error as Error | null,
      reset,
    }),
    [
      deployment,
      owner,
      isAllowed,
      isCheckingPermission,
      ociRepository,
      deleteDeployment,
      mutation.isPending,
      mutation.error,
      reset,
    ],
  );
}

/** What {@link useDeleteDeployment} hands to the confirmation UI. */
export type UseDeleteDeploymentResult = ReturnType<typeof useDeleteDeployment>;
