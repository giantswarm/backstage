import React from 'react';
import { Card, CardContent } from '@material-ui/core';
import PublicIcon from '@material-ui/icons/Public';
import NotificationsNoneIcon from '@material-ui/icons/NotificationsNone';
import { useCurrentCluster } from '../../../ClusterDetailsPage/useCurrentCluster';
import { GrafanaIcon } from '../../../../../assets/icons/CustomIcons';
import { Toolkit } from '../../../../UI';
import {
  getClusterName,
  getClusterOrganization,
  isManagementCluster,
} from '@giantswarm/backstage-plugin-gs-common';
import {
  useGrafanaAlertsLink,
  useGrafanaDashboardsLink,
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

  const dashboardsLink = useGrafanaDashboardsLink(installationName);
  const dashboardsLinkDisabledNote = dashboardsLink
    ? ''
    : `Grafana dashboards link is not available. Base domain is not configured for '${installationName}' installation.`;

  const alertsLink = useGrafanaAlertsLink(installationName);
  const alertsLinkDisabledNote = alertsLink
    ? ''
    : `Grafana alerts link is not available. Base domain is not configured for '${installationName}' installation.`;

  const tools = [
    {
      url: dashboardsLink ?? '',
      label: 'Dashboards',
      icon: <GrafanaIcon />,
      disabled: Boolean(dashboardsLinkDisabledNote),
      disabledNote: dashboardsLinkDisabledNote,
    },
    {
      url: alertsLink ?? '',
      label: 'Alerts',
      icon: <NotificationsNoneIcon />,
      disabled: Boolean(alertsLinkDisabledNote),
      disabledNote: alertsLinkDisabledNote,
    },
    {
      url: webUILink ?? '',
      label: 'Web UI',
      icon: <PublicIcon />,
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
