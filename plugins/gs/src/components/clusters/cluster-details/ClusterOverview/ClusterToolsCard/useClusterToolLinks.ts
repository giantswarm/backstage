import { useSignedInConfig } from '@giantswarm/backstage-plugin-gs-react';
import type { Cluster } from '@giantswarm/backstage-plugin-kubernetes-react';
import { formatTemplateString } from '../../../../utils/formatTemplateString';
import { useClusterDetailsTemplateData } from '../../../../hooks';
import { isManagementCluster } from '../../../utils';

/** A link to a tool outside the portal for one cluster, e.g. its dashboard. */
export type ClusterToolLink = {
  label: string;
  /** The name of the icon `IconResolver` draws. */
  icon: string;
  url: string;
};

const defaultLinks = [
  {
    label: 'Cluster overview \n dashboard',
    icon: 'GrafanaIcon',
    url: 'https://grafana.${{BASE_DOMAIN}}/d/gs_cluster-overview/cluster-overview?orgId=1&from=now-6h&to=now&timezone=browser&var-datasource=default&var-cluster=${{CLUSTER_NAME}}',
  },
];

/**
 * The cluster's tool links: `gs.clusterDetails.resources` of the signed-in
 * config for the cluster's type, else the cluster overview dashboard, each
 * URL filled in for the cluster. A link whose URL cannot be filled in (no
 * base domain known) is left out. `isLoading` while the config loads, so the
 * configured links and the default never show one after the other.
 */
export function useClusterToolLinks(
  installationName: string,
  cluster: Cluster,
): { isLoading: boolean; links: ClusterToolLink[] } {
  const { config, isLoading } = useSignedInConfig();
  const templateData = useClusterDetailsTemplateData(installationName, cluster);

  if (isLoading) {
    return { isLoading, links: [] };
  }

  const linksConfig = config?.getOptionalConfigArray(
    'gs.clusterDetails.resources',
  );
  const clusterType = isManagementCluster(cluster) ? 'management' : 'workload';
  const configured = linksConfig
    ? linksConfig
        .map(link => ({
          url: link.getString('url'),
          label: link.getString('label'),
          icon: link.getString('icon'),
          clusterType: link.getOptionalString('clusterType'),
        }))
        .filter(
          link =>
            typeof link.clusterType === 'undefined' ||
            link.clusterType === clusterType,
        )
    : defaultLinks;

  const links = configured.flatMap(link => {
    const url = formatTemplateString(link.url, { data: templateData });
    return url ? [{ url, label: link.label, icon: link.icon }] : [];
  });
  return { isLoading: false, links };
}
