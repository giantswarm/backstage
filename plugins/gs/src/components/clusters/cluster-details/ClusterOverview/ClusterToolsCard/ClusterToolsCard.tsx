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
import { useMemo } from 'react';
import { configApiRef, useApi } from '@backstage/core-plugin-api';
import { Tool } from '../../../../UI/Toolkit';
import { formatTemplateString } from '../../../../utils/formatTemplateString';
import { useClusterDetailsTemplateData } from '../../../../hooks';

export function ClusterToolsCard() {
  const configApi = useApi(configApiRef);
  const { cluster, installationName } = useCurrentCluster();

  const clusterName = getClusterName(cluster);
  const organizationName = getClusterOrganization(cluster);

  const clusterDetailsTemplateData = useClusterDetailsTemplateData(
    installationName,
    cluster,
  );

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

  const defaultLinks = useMemo(() => {
    return [
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
  }, [
    alertsLink,
    alertsLinkDisabledNote,
    dashboardLink,
    dashboardsLinkDisabledNote,
    webUILink,
    webUILinkDisabledNote,
  ]);

  const combinedLinks = useMemo(() => {
    const result: Tool[] = [...defaultLinks];

    // Add extra links from cluster details page configuration
    const linksConfig = configApi.getOptionalConfigArray(
      'gs.clusterDetails.resources',
    );
    if (linksConfig) {
      linksConfig.forEach(link => {
        result.push({
          url: formatTemplateString(link.getString('url'), {
            data: clusterDetailsTemplateData,
          }),
          label: link.getString('label'),
          icon: link.getString('icon'),
        });
      });
    }

    return result;
  }, [clusterDetailsTemplateData, configApi, defaultLinks]);

  return (
    <Card>
      <CardContent>
        <Toolkit tools={combinedLinks} />
      </CardContent>
    </Card>
  );
}
