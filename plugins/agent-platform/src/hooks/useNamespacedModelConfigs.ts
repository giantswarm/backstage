import { useMemo } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { useQueries } from '@tanstack/react-query';
import { isAwaitingData } from '@giantswarm/backstage-plugin-ui-react';
import {
  fetchResourceList,
  getK8sListPath,
  ModelConfig,
} from '@giantswarm/backstage-plugin-kubernetes-react';

import { AgentManagerClient } from '../apis/AgentManagerClient';
import type { AgentManagerInfo } from '../lib/agentManager';
import { musterAgentManagerInfoQueryKey } from '../lib/queryKeys';
import { DEFAULT_MODEL_CONFIG_NAMESPACE } from '../components/ModelConfigPicker/helpers';
import { useAgentManagerAvailability } from './useAgentManager';
import { useMusterPluginApi } from './useMusterPluginApi';

export type NamespacedModelConfigs = {
  /** The ModelConfigs of every namespace read, on every installation. */
  resources: ModelConfig[];
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
 * The namespaces to read an installation's ModelConfigs in: the platform
 * namespace, where the platform's default model lives, and agent-manager's
 * default and managed namespaces, where agents land.
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

/**
 * ModelConfigs read namespace by namespace, for the installations where the
 * person may not list them cluster-wide (a namespaced kagent RoleBinding).
 * A namespace that refuses the list too (403) is skipped; any other failure
 * leaves the installation unread. The lists are one person's view, so they
 * are never persisted.
 */
export function useNamespacedModelConfigs(
  installations: string[],
): NamespacedModelConfigs {
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

  const targets = installations.flatMap((installation, index) =>
    namespacesKnown(index)
      ? agentNamespacesOf(infos[index].data).map(namespace => ({
          installation,
          namespace,
        }))
      : [],
  );

  const gvk = ModelConfig.getGVK();
  const lists = useQueries({
    queries: targets.map(({ installation, namespace }) => {
      const path = getK8sListPath(gvk, { namespace });
      return {
        // `useListResources`' key for the same list.
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
          fetchResourceList<ModelConfig['jsonData']>({
            kubernetesApi,
            cluster: installation,
            gvk,
            namespace,
          }),
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
    const resources: ModelConfig[] = [];
    const pending = new Set<string>();
    const read = new Set<string>();
    const failed = new Set<string>();
    installations.forEach((installation, index) => {
      if (!namespacesKnown(index)) {
        pending.add(installation);
      }
    });
    targets.forEach(({ installation }, index) => {
      const list = lists[index];
      if (list.isSuccess) {
        read.add(installation);
        resources.push(
          ...list.data.map(item => new ModelConfig(item, installation)),
        );
      } else if (isAwaitingData(list)) {
        pending.add(installation);
      } else if (list.error?.name !== 'ForbiddenError') {
        failed.add(installation);
      }
    });
    return {
      resources,
      pendingInstallations: installations.filter(name => pending.has(name)),
      unreadInstallations: installations.filter(
        name => !pending.has(name) && (failed.has(name) || !read.has(name)),
      ),
    };
    // `infos`, `lists`, `targets` and `namespacesKnown` are fresh every
    // render; key on their contents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, targetsKey, installationsKey, agentManager.isLoading]);
}
