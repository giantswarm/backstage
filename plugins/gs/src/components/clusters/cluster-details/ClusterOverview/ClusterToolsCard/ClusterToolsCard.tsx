import { Card, CardContent } from '@material-ui/core';
import { useCurrentCluster } from '../../../ClusterDetailsPage/useCurrentCluster';
import { Toolkit } from '../../../../UI';
import { isManagementCluster } from '@giantswarm/backstage-plugin-gs-common';
import { configApiRef, useApi } from '@backstage/core-plugin-api';
import { formatTemplateString } from '../../../../utils/formatTemplateString';
import { useClusterDetailsTemplateData } from '../../../../hooks';

const defaultLinks = [
  {
    label: 'Cluster overview \n dashboard',
    icon: 'GrafanaIcon',
    url: 'https://grafana.${{BASE_DOMAIN}}/d/gs_cluster-overview/cluster-overview?orgId=1&from=now-6h&to=now&timezone=browser&var-datasource=default&var-cluster=${{CLUSTER_NAME}}',
  },
  {
    label: 'Alerts',
    icon: 'NotificationsNone',
    url: 'https://grafana.${{BASE_DOMAIN}}/alerting',
  },
  {
    label: 'Web UI',
    icon: 'Public',
    url: 'https://happa.${{BASE_DOMAIN}}/organizations/${{ORG_NAME}}/clusters/${{CLUSTER_NAME}}',
    clusterType: 'workload',
  },
  {
    label: 'Web UI',
    icon: 'Public',
    url: 'https://happa.${{BASE_DOMAIN}}',
    clusterType: 'management',
  },
];

export function ClusterToolsCard() {
  const configApi = useApi(configApiRef);
  const { cluster, installationName } = useCurrentCluster();

  const clusterDetailsTemplateData = useClusterDetailsTemplateData(
    installationName,
    cluster,
  );

  const linksConfig = configApi.getOptionalConfigArray(
    'gs.clusterDetails.resources',
  );

  const links = linksConfig
    ? linksConfig.map(link => ({
        url: link.getString('url'),
        label: link.getString('label'),
        icon: link.getString('icon'),
        clusterType: link.getOptionalString('clusterType'),
      }))
    : defaultLinks;

  const clusterType = isManagementCluster(cluster, installationName)
    ? 'management'
    : 'workload';
  const filteredLinks = links.filter(
    link =>
      typeof link.clusterType === 'undefined' ||
      link.clusterType === clusterType,
  );

  const tools = filteredLinks.map(link => ({
    url: formatTemplateString(link.url, {
      data: clusterDetailsTemplateData,
    }),
    label: link.label,
    icon: link.icon,
  }));

  return (
    <Card>
      <CardContent>
        <Toolkit tools={tools} />
      </CardContent>
    </Card>
  );
}
