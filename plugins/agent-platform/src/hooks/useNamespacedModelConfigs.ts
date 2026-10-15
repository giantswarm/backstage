import { useMemo } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { useQueries } from '@tanstack/react-query';
import { isAwaitingData } from '@giantswarm/backstage-plugin-ui-react';
import {
  fetchResourceList,
  ModelConfig,
} from '@giantswarm/backstage-plugin-kubernetes-react';

import { AgentManagerClient } from '../apis/AgentManagerClient';
import type { AgentManagerInfo } from '../lib/agentManager';
import { musterAgentManagerInfoQueryKey } from '../lib/queryKeys';
import { DEFAULT_MODEL_CONFIG_NAMESPACE } from '../components/ModelConfigPicker/helpers';
import { useMusterPluginApi } from './useMusterPluginApi';

export type NamespacedModelConfigs = {
  /** The ModelConfigs of every namespace read, on every installation. */
  resources: ModelConfig[];
  /** Installations with at least one namespace read, even an empty one. */
  readInstallations: string[];
  /** Installations still waiting for their namespaces or their reads. */
  pendingInstallations: string[];
};

/**
 * The namespaces agents land in on an installation: agent-manager's default
 * and managed ones, or the platform namespace when agent-manager cannot say.
 */
export function agentNamespacesOf(info: AgentManagerInfo | undefined) {
  if (!info) {
    return [DEFAULT_MODEL_CONFIG_NAMESPACE];
  }
  return Array.from(
    new Set([info.namespaces.default, ...info.namespaces.managed]),
  ).filter(Boolean);
}

/**
 * ModelConfigs read namespace by namespace, for the installations where the
 * person may not list them cluster-wide (a namespaced kagent RoleBinding).
 * Each installation's namespaces are the ones agents land in (`get_info`); a
 * namespace the person may not read either is skipped, and an installation
 * counts as read once one of its namespaces answered.
 */
export function useNamespacedModelConfigs(
  installations: string[],
): NamespacedModelConfigs {
  const kubernetesApi = useApi(kubernetesApiRef);
  const musterApi = useMusterPluginApi();

  // Same query as `useAgentManagerInfo`, so the wizard's own read shares it.
  const infos = useQueries({
    queries: installations.map(installation => ({
      queryKey: musterAgentManagerInfoQueryKey(installation),
      enabled: Boolean(musterApi),
      queryFn: () => new AgentManagerClient(musterApi!, installation).getInfo(),
      staleTime: 60_000,
      retry: false,
    })),
  });

  const targets = installations.flatMap((installation, index) => {
    const info = infos[index];
    if (musterApi && isAwaitingData(info)) {
      return [];
    }
    return agentNamespacesOf(info.data).map(namespace => ({
      installation,
      namespace,
    }));
  });

  const gvk = ModelConfig.getGVK();
  const lists = useQueries({
    queries: targets.map(({ installation, namespace }) => ({
      // The list query's key (`useListResources`), scoped to the namespace.
      queryKey: [
        'cluster',
        installation,
        'list',
        gvk.group,
        gvk.apiVersion,
        gvk.plural,
        `namespace/${namespace}`,
      ],
      queryFn: () =>
        fetchResourceList<ModelConfig['jsonData']>({
          kubernetesApi,
          cluster: installation,
          gvk,
          namespace,
        }),
    })),
  });

  const signature = [
    ...infos.map(info => `${info.status}:${info.dataUpdatedAt}`),
    ...lists.map(list => `${list.status}:${list.dataUpdatedAt}`),
  ].join(',');
  const targetsKey = targets
    .map(({ installation, namespace }) => `${installation}/${namespace}`)
    .join(',');
  const installationsKey = installations.join(',');

  return useMemo(() => {
    const resources: ModelConfig[] = [];
    const read = new Set<string>();
    const pending = new Set(
      installations.filter(
        installation =>
          !targets.some(target => target.installation === installation),
      ),
    );
    targets.forEach(({ installation }, index) => {
      const list = lists[index];
      if (list.isSuccess) {
        read.add(installation);
        resources.push(
          ...list.data.map(item => new ModelConfig(item, installation)),
        );
      } else if (isAwaitingData(list)) {
        pending.add(installation);
      }
    });
    return {
      resources,
      readInstallations: installations.filter(name => read.has(name)),
      pendingInstallations: installations.filter(
        name => pending.has(name) && !read.has(name),
      ),
    };
    // `infos`, `lists` and `targets` are fresh arrays every render; key on
    // their contents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, targetsKey, installationsKey]);
}
