import { Card, CardContent } from '@material-ui/core';
import { useCurrentCluster } from '../../../ClusterDetailsPage/useCurrentCluster';
import { Toolkit } from '../../../../UI';
import {
  getClusterName,
  getClusterOrganization,
  isManagementCluster,
} from '@giantswarm/backstage-plugin-gs-common';
import {
  useGrafanaAlertsLink,
  useGrafanaDashboardLink,
  useWebUILink,
} from '../../../../hooks/useClusterLinks';

export function ClusterToolsCard() {
  const { cluster, installationName } = useCurrentCluster();

  const clusterName = getClusterName(cluster);
  const organizationName = getClusterOrganization(cluster);

  const webUILink = useWebUILink(
    installationName,
    clusterName,
    organizationName ?? '',
    isManagementCluster(cluster, installationName),
  );
  const webUILinkDisabledNote = webUILink
    ? ''
    : `Web UI link is not available. Base domain is not configured for '${installationName}' installation.`;

  const dashboardLink = useGrafanaDashboardLink(installationName, clusterName);
  const dashboardsLinkDisabledNote = dashboardLink
    ? ''
    : `Cluster overview dashboard link is not available. Base domain is not configured for '${installationName}' installation.`;

  const alertsLink = useGrafanaAlertsLink(installationName);
  const alertsLinkDisabledNote = alertsLink
    ? ''
    : `Grafana alerts link is not available. Base domain is not configured for '${installationName}' installation.`;

  const tools = [
    {
      url: dashboardLink ?? '',
      label: 'Cluster overview \n dashboard',
      icon: 'GrafanaIcon',
      disabled: Boolean(dashboardsLinkDisabledNote),
      disabledNote: dashboardsLinkDisabledNote,
    },
    {
      url: alertsLink ?? '',
      label: 'Alerts',
      icon: 'NotificationsNone',
      disabled: Boolean(alertsLinkDisabledNote),
      disabledNote: alertsLinkDisabledNote,
    },
    {
      url: webUILink ?? '',
      label: 'Web UI',
      icon: 'Public',
      disabled: Boolean(webUILinkDisabledNote),
      disabledNote: webUILinkDisabledNote,
    },
  ];

  return (
    <Card>
      <CardContent>
        <Toolkit tools={tools} />
      </CardContent>
    </Card>
  );
}
