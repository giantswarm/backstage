import { useMemo } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { useQueries } from '@tanstack/react-query';
import { isAwaitingData } from '@giantswarm/backstage-plugin-ui-react';
import {
  type ErrorInfoUnion,
  fetchResourceList,
  getK8sListPath,
  type KubeObject,
  type KubeObjectInterface,
  type MultiVersionResourceMatcher,
  type UseResourcesQueryOptions,
} from '@giantswarm/backstage-plugin-kubernetes-react';

import { AgentManagerClient } from '../apis/AgentManagerClient';
import type { AgentManagerInfo } from '../lib/agentManager';
import { musterAgentManagerInfoQueryKey } from '../lib/queryKeys';
import { DEFAULT_MODEL_CONFIG_NAMESPACE } from '../components/ModelConfigPicker/helpers';
import { useAgentManagerAvailability } from './useAgentManager';
import { useMusterPluginApi } from './useMusterPluginApi';

/** A kagent resource class, as `useResources` takes it. */
export type ResourceClass<R extends KubeObject<any>> = (new (
  json: any,
  cluster: string,
) => R) & {
  getGVK(): MultiVersionResourceMatcher;
};

/** One installation's list, as `useResources` reports it. */
export type ClusterData = { cluster: string; data: KubeObjectInterface[] };

/** The part of a `useResources` result the fallback reads and returns. */
export type ResourcesResult<R> = {
  resources: R[];
  clustersData: ClusterData[];
  errors: ErrorInfoUnion[];
  isLoading: boolean;
};

export type NamespacedResources<R> = {
  /** The items of the installations read (`clustersData`). */
  resources: R[];
  /**
   * Installations read: every namespace answered, at least one with a list,
   * none with a failure other than a refusal. Their lists merged.
   */
  clustersData: ClusterData[];
  /**
   * Installations whose namespaces are not all answered yet, including the
   * ones whose namespaces are not known yet.
   */
  pendingInstallations: string[];
  /**
   * Installations with a namespace that failed for another reason than a
   * refusal, or whose every namespace refused the list.
   */
  unreadInstallations: string[];
};

/**
 * The namespaces to read an installation's kagent resources in: the platform
 * namespace, where the platform's own agents and default model live, and
 * agent-manager's default and managed namespaces, where agents land.
 */
export function agentNamespacesOf(info: AgentManagerInfo | undefined) {
  const namespaces = info?.namespaces;
  return Array.from(
    new Set([
      DEFAULT_MODEL_CONFIG_NAMESPACE,
      namespaces?.default,
      ...(namespaces?.managed ?? []),
    ]),
  ).filter((namespace): namespace is string => Boolean(namespace));
}

/** The installations whose cluster-wide list was refused (403). */
export function forbiddenInstallationsOf(errors: ErrorInfoUnion[]): string[] {
  return Array.from(
    new Set(
      errors
        .filter(
          e =>
            e.type !== 'incompatibility' && e.error.name === 'ForbiddenError',
        )
        .map(e => e.cluster),
    ),
  );
}

/**
 * A cluster-wide read with the namespaced read of its refused installations
 * folded in: a read installation answers with its merged list instead of the
 * 403, one still pending reports neither (and keeps the result loading), an
 * unread one keeps its 403 and contributes nothing, as a failed cluster-wide
 * read would.
 */
export function mergeNamespaced<R extends { cluster: string }>(
  base: ResourcesResult<R>,
  namespaced: NamespacedResources<R>,
): ResourcesResult<R> {
  const read = new Set(namespaced.clustersData.map(({ cluster }) => cluster));
  const pending = new Set(namespaced.pendingInstallations);
  const forbidden = new Set(forbiddenInstallationsOf(base.errors));
  return {
    resources: [
      ...base.resources,
      ...namespaced.resources.filter(item => read.has(item.cluster)),
    ],
    clustersData: [...base.clustersData, ...namespaced.clustersData],
    errors: base.errors.filter(
      e =>
        !forbidden.has(e.cluster) ||
        !(read.has(e.cluster) || pending.has(e.cluster)),
    ),
    isLoading: base.isLoading || namespaced.pendingInstallations.length > 0,
  };
}

/**
 * kagent resources read namespace by namespace, for the installations where
 * the person may not list them cluster-wide (a namespaced kagent RoleBinding).
 * A namespace that refuses the list too (403) is skipped; any other failure
 * leaves the installation unread. The lists are one person's view, so they
 * are never persisted.
 */
export function useNamespacedResources<R extends KubeObject<any>>(
  installations: string[],
  Resource: ResourceClass<R>,
  queryOptions: UseResourcesQueryOptions<KubeObjectInterface[]> = {},
): NamespacedResources<R> {
  const kubernetesApi = useApi(kubernetesApiRef);
  const musterApi = useMusterPluginApi();
  const agentManager = useAgentManagerAvailability(installations);

  // Same query as `useAgentManagerInfo`, asked only where muster reaches
  // agent-manager as the person.
  const infos = useQueries({
    queries: installations.map(installation => ({
      queryKey: musterAgentManagerInfoQueryKey(installation),
      enabled:
        Boolean(musterApi) &&
        agentManager.presenceOf(installation) === 'available',
      queryFn: () => new AgentManagerClient(musterApi!, installation).getInfo(),
      staleTime: 60_000,
      retry: false,
    })),
  });

  // An installation's namespaces are known once agent-manager answered, or
  // once it is known not to answer: then the platform namespace alone.
  const namespacesKnown = (index: number) => {
    const presence = agentManager.presenceOf(installations[index]);
    if (presence === 'available') {
      return !isAwaitingData(infos[index]);
    }
    return presence !== 'unknown' || !agentManager.isLoading;
  };

  // Known, but only as the platform namespace because muster could not say
  // which namespaces agents land in: its agent-manager info read failed, or
  // its server list did. An empty answer then is no answer -- the agents may
  // be in the namespaces it could not name -- so it leaves the installation
  // unread rather than read with none.
  const namespacesGuessed = (index: number) => {
    if (!musterApi) {
      return false;
    }
    const presence = agentManager.presenceOf(installations[index]);
    if (presence === 'available') {
      return infos[index].isError;
    }
    return presence === 'unknown' && !agentManager.isLoading;
  };

  const targets = installations.flatMap((installation, index) =>
    namespacesKnown(index)
      ? agentNamespacesOf(infos[index].data).map(namespace => ({
          installation,
          namespace,
        }))
      : [],
  );

  // Discovery is the cluster-wide read's business: the namespaced lists use
  // the class's own version.
  const { enableDiscovery: _enableDiscovery, ...listOptions } = queryOptions;
  const gvk = Resource.getGVK();
  const lists = useQueries({
    queries: targets.map(({ installation, namespace }) => {
      const path = getK8sListPath(gvk, { namespace });
      return {
        // `useListResources`' key for the same list, so a refetch interval
        // reading the installation off the key works unchanged.
        queryKey: [
          'cluster',
          installation,
          'list',
          gvk.group,
          gvk.apiVersion,
          gvk.plural,
          path,
        ],
        queryFn: () =>
          fetchResourceList({
            kubernetesApi,
            cluster: installation,
            gvk,
            namespace,
          }),
        ...listOptions,
        meta: { persist: false },
      };
    }),
  });

  const signature = [
    ...infos.map(info => `${info.status}:${info.dataUpdatedAt}`),
    ...lists.map(list => `${list.status}:${list.dataUpdatedAt}`),
  ].join(',');
  const targetsKey = targets
    .map(({ installation, namespace }) => `${installation}/${namespace}`)
    .join(',');
  const installationsKey = installations
    .map(name => `${name}:${agentManager.presenceOf(name)}`)
    .join(',');

  return useMemo(() => {
    const items = new Map<string, KubeObjectInterface[]>();
    const pending = new Set<string>();
    const failed = new Set<string>();
    installations.forEach((installation, index) => {
      if (!namespacesKnown(index)) {
        pending.add(installation);
      }
    });
    targets.forEach(({ installation }, index) => {
      const list = lists[index];
      if (list.isSuccess) {
        items.set(installation, [
          ...(items.get(installation) ?? []),
          ...list.data,
        ]);
      } else if (isAwaitingData(list)) {
        pending.add(installation);
      } else if (list.error?.name !== 'ForbiddenError') {
        failed.add(installation);
      }
    });
    installations.forEach((installation, index) => {
      if (
        namespacesGuessed(index) &&
        !pending.has(installation) &&
        !items.get(installation)?.length
      ) {
        failed.add(installation);
      }
    });
    const clustersData = installations
      .filter(
        name => items.has(name) && !pending.has(name) && !failed.has(name),
      )
      .map(cluster => ({ cluster, data: items.get(cluster)! }));
    return {
      resources: clustersData.flatMap(({ cluster, data }) =>
        data.map(item => new Resource(item, cluster)),
      ),
      clustersData,
      pendingInstallations: installations.filter(name => pending.has(name)),
      unreadInstallations: installations.filter(
        name => !pending.has(name) && (failed.has(name) || !items.has(name)),
      ),
    };
    // `infos`, `lists`, `targets` and `namespacesKnown` are fresh every
    // render; key on their contents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    signature,
    targetsKey,
    installationsKey,
    agentManager.isLoading,
    Resource,
  ]);
}

/**
 * A `useResources` result whose refused installations (403 on the
 * cluster-wide list) are read again namespace by namespace and folded in
 * (`mergeNamespaced`), so a person with a namespaced kagent RoleBinding sees
 * what they may read instead of "couldn't read". Same refetch options as the
 * cluster-wide read.
 */
export function useNamespacedFallback<R extends KubeObject<any>>(
  base: ResourcesResult<R>,
  Resource: ResourceClass<R>,
  queryOptions: UseResourcesQueryOptions<KubeObjectInterface[]> = {},
): ResourcesResult<R> {
  const namespaced = useNamespacedResources(
    forbiddenInstallationsOf(base.errors),
    Resource,
    queryOptions,
  );
  const { resources, clustersData, errors, isLoading } = base;
  return useMemo(
    () =>
      mergeNamespaced(
        { resources, clustersData, errors, isLoading },
        namespaced,
      ),
    [resources, clustersData, errors, isLoading, namespaced],
  );
}
