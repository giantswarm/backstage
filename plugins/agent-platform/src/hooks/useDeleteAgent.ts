import { useCallback, useMemo } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Agent,
  CustomResourceMatcher,
  deleteResource,
  fetchResourceList,
  HelmRelease,
  getHelmReleaseName,
  getHelmReleaseNamespace,
  isManagedByFlux,
  OCIRepository,
  useResource,
  useSelfSubjectAccessReview,
} from '@giantswarm/backstage-plugin-kubernetes-react';

/** A `spec.chartRef` pointing at the chart source a release renders from. */
type ChartSourceRef = {
  name: string;
  namespace: string;
};

function isSameObject(
  a: { name?: string; namespace?: string },
  b: { name?: string; namespace?: string },
) {
  return a.name === b.name && a.namespace === b.namespace;
}

/**
 * Deleting one agent, and the checks that decide whether to offer it at all.
 *
 * An agent is not a thing we can delete directly: it is rendered by the `agent`
 * chart, so the object that owns its existence is the `HelmRelease`, and removing
 * that is what makes helm-controller uninstall the release and take the `Agent`
 * CR with it. The owner is found through the Flux provenance labels rather than
 * by assuming the release is named after the agent, so this also works for agents
 * created outside this plugin's wizard.
 *
 * The `OCIRepository` the release points at is a different matter: every agent in
 * a namespace shares one `agent` chart source, so it may only be removed once
 * nothing else references it. The check is a list of the `HelmRelease`s in the
 * source's namespace, and every uncertainty resolves to keeping it — an orphaned
 * chart source is inert and the next agent created in the namespace re-applies an
 * identical one, while a wrongly deleted one breaks every remaining agent's next
 * reconciliation.
 *
 * Call this from inside the plugin's `QueryClientProvider` — i.e. from the page,
 * not from the actions element the page hands to `useProvidePageHeaderActions`,
 * which renders in the shared header outside that provider. `agent` is therefore
 * optional: the page has none while it is still loading, and a hook cannot be
 * called conditionally.
 */
export function useDeleteAgent(agent: Agent | undefined) {
  const kubernetesApi = useApi(kubernetesApiRef);
  const queryClient = useQueryClient();

  const cluster = agent?.cluster ?? '';
  const helmReleaseName = agent ? getHelmReleaseName(agent) : undefined;
  const helmReleaseNamespace = agent
    ? (getHelmReleaseNamespace(agent) ?? agent.getNamespace())
    : undefined;
  const hasOwner = Boolean(helmReleaseName);

  // The owning release, for three things: whether Flux owns it declaratively,
  // which chart source it uses, and the API version to address it at.
  const { resource: helmRelease, isLoading: isLoadingHelmRelease } =
    useResource(
      cluster,
      HelmRelease,
      {
        name: helmReleaseName ?? '',
        namespace: helmReleaseNamespace,
        enableDiscovery: false,
      },
      { enabled: hasOwner },
    );

  // A release applied by a Kustomization has its desired state in Git, so
  // deleting it here would be undone on the next reconciliation — a confusing
  // no-op dressed up as a deletion. Those agents stay read-only.
  const isGitOpsOwned = helmRelease ? isManagedByFlux(helmRelease) : false;

  const { allowed: isAllowed, isLoading: isCheckingPermission } =
    useSelfSubjectAccessReview(
      cluster,
      {
        group: HelmRelease.group,
        resource: HelmRelease.plural,
        namespace: helmReleaseNamespace,
        // Named, so a grant restricted via `resourceNames` answers accurately.
        name: helmReleaseName,
        verb: 'delete',
      },
      { enabled: hasOwner },
    );

  const chartRef = helmRelease?.getChartRef();
  const chartSource: ChartSourceRef | undefined =
    chartRef?.kind === 'OCIRepository'
      ? { name: chartRef.name, namespace: chartRef.namespace }
      : undefined;

  // Read at its served version so a delete addresses a version the cluster
  // actually has — `OCIRepository` exists as both v1beta2 and v1, so discovery
  // stays on here. No object means there is nothing to remove.
  const { resource: chartSourceResource } = useResource(
    cluster,
    OCIRepository,
    {
      name: chartSource?.name ?? '',
      namespace: chartSource?.namespace ?? '',
    },
    { enabled: Boolean(chartSource) },
  );

  /**
   * Whether anything other than this agent's own release still renders from the
   * chart source — answered from a **fresh** list, not the query cache.
   *
   * Deliberately not `useResources`: this decides whether to destroy a shared
   * object, and a cached list is the wrong basis for that. `staleTime` is 60s
   * here and the cache is persisted, so a sibling agent created moments ago in
   * another tab would be invisible — and the answer would look certain.
   *
   * Throws if the list cannot be read, which the caller turns into "keep the
   * source". An empty list because the read failed is not the same answer as an
   * empty list because nothing references it.
   *
   * Scoped to the source's own namespace. A cross-namespace `chartRef` from
   * elsewhere would not be seen, but listing cluster-wide needs a read a tenant
   * user does not have, and the cost of being wrong that way is a chart source
   * the next agent creation re-applies.
   */
  const isChartSourceShared = async (
    source: ChartSourceRef,
    releaseGVK: CustomResourceMatcher,
  ) => {
    const items = await fetchResourceList<HelmRelease['jsonData']>({
      kubernetesApi,
      cluster,
      gvk: releaseGVK,
      namespace: source.namespace,
    });

    return items
      .map(item => new HelmRelease(item, cluster))
      .some(release => {
        // Our own release does not count as another user of the source.
        if (
          isSameObject(
            { name: release.getName(), namespace: release.getNamespace() },
            { name: helmReleaseName, namespace: helmReleaseNamespace },
          )
        ) {
          return false;
        }

        const ref = release.getChartRef();

        return ref?.kind === 'OCIRepository' && isSameObject(ref, source);
      });
  };

  const invalidateReads = async (gvks: CustomResourceMatcher[]) => {
    // Prefixes of the keys the read hooks register (see `useListResources` /
    // `useGetResource`), so one entry per kind covers every list and instance of
    // it on this cluster. Invalidate rather than editing the cache: the
    // QueryClient is persisted to localStorage, so a stale pre-deletion object
    // could otherwise be rehydrated on reload.
    await Promise.all(
      gvks.flatMap(gvk =>
        ['list', 'get'].map(operation =>
          queryClient.invalidateQueries({
            queryKey: [
              'cluster',
              cluster,
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
      if (!agent || !helmRelease || !helmReleaseName) {
        throw new Error(
          'The HelmRelease that reconciles this agent could not be read, so it cannot be deleted from here. Try reloading the page.',
        );
      }

      // Deleting a suspended release removes the release and nothing else: Flux
      // drops its finalizer without running the uninstall, leaving the Agent and
      // the rest of the chart's objects behind — and with no owner, so this path
      // could not clean them up afterwards either. Refuse rather than report an
      // uninstall that will not happen.
      if (helmRelease.isSuspended()) {
        throw new Error(
          `HelmRelease ${helmReleaseNamespace}/${helmReleaseName} is suspended. Flux would remove it without uninstalling the agent, leaving its resources behind. Resume the release first, then delete the agent.`,
        );
      }

      const helmReleaseGVK = helmRelease.getResolvedGVK();

      try {
        await deleteResource({
          kubernetesApi,
          cluster,
          gvk: helmReleaseGVK,
          name: helmReleaseName,
          namespace: helmReleaseNamespace,
        });
      } catch (error) {
        // Already gone — someone else deleted it, or an earlier attempt got
        // further than its error suggested. Either way the goal is met.
        if ((error as Error).name !== 'NotFoundError') {
          throw error;
        }
      }

      const invalidated: CustomResourceMatcher[] = [
        helmReleaseGVK,
        agent.getResolvedGVK(),
      ];

      // Everything from here is best-effort cleanup of the shared chart source,
      // after the point where the agent is already gone. Every failure — an
      // unreadable sibling list, a denied delete — leaves the source in place,
      // which is always the safe outcome: it is inert on its own, and the next
      // agent created in the namespace re-applies an identical one. That is also
      // why the permission gate does not require `delete` on `ocirepositories`.
      if (chartSource && chartSourceResource) {
        try {
          if (!(await isChartSourceShared(chartSource, helmReleaseGVK))) {
            const chartSourceGVK = chartSourceResource.getResolvedGVK();

            await deleteResource({
              kubernetesApi,
              cluster,
              gvk: chartSourceGVK,
              name: chartSourceResource.getName(),
              namespace: chartSourceResource.getNamespace(),
            });
            invalidated.push(chartSourceGVK);
          }
        } catch {
          // Keep the source. Failing the whole operation here would report a
          // successful deletion as an error.
        }
      }

      await invalidateReads(invalidated);
    },
  });

  const { mutateAsync, reset } = mutation;
  const deleteAgent = useCallback(async () => {
    await mutateAsync();
  }, [mutateAsync]);

  // Memoized as a whole because the page passes this straight into the element it
  // registers as the header's actions: a fresh object every render would
  // re-register (and re-render) that slot on every poll.
  return useMemo(
    () => ({
      /**
       * Whether to offer the deletion: the owning release is **in hand** (not
       * merely named by a label), it is not declaratively owned by Flux, and the
       * cluster says this user may delete it.
       *
       * Keyed on the object rather than on `hasOwner`, so that a release we could
       * not read is "cannot decide" instead of "no owner". Those differ: an
       * unreadable release also reads as not-GitOps-owned, which would quietly
       * switch off the Kustomization guard, and the mutation needs the object
       * anyway — offering an action that is certain to fail is worse than not
       * offering it. Reachable via a proxy 5xx (not retried for
       * `ServiceUnavailableError`, and this read does not poll) or RBAC granting
       * `delete` without `get`.
       */
      isDeletable: Boolean(helmRelease) && !isGitOpsOwned && isAllowed,
      /** Still establishing the above. Withhold the affordance rather than guess. */
      isCheckingDeletable:
        hasOwner && (isLoadingHelmRelease || isCheckingPermission),
      deleteAgent,
      isDeleting: mutation.isPending,
      error: mutation.error as Error | null,
      reset,
    }),
    // `helmRelease` itself is deliberately not returned: the confirmation dialog
    // says nothing mechanical, so it is internal to the mutation now.
    [
      hasOwner,
      helmRelease,
      isGitOpsOwned,
      isAllowed,
      isLoadingHelmRelease,
      isCheckingPermission,
      deleteAgent,
      mutation.isPending,
      mutation.error,
      reset,
    ],
  );
}

/** What {@link useDeleteAgent} hands to the confirmation UI. */
export type UseDeleteAgentResult = ReturnType<typeof useDeleteAgent>;
