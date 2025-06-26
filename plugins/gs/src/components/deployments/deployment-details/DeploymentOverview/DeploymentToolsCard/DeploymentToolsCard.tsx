import { Card, CardContent } from '@material-ui/core';
import { configApiRef, useApi } from '@backstage/core-plugin-api';
import { useCurrentDeployment } from '../../../DeploymentDetailsPage/useCurrentDeployment';
import { Toolkit, type Tool } from '../../../../UI';
import { formatTemplateString } from '../../../../utils/formatTemplateString';
import { useDeploymentDetailsTemplateData } from '../../../../hooks';

export function DeploymentToolsCard() {
  const configApi = useApi(configApiRef);
  const { deployment, installationName } = useCurrentDeployment();

  const deploymentDetailsTemplateData = useDeploymentDetailsTemplateData(
    installationName,
    deployment,
  );

  const linksConfig = configApi.getOptionalConfigArray(
    'gs.deploymentDetails.resources',
  );

  const links = linksConfig
    ? linksConfig.map(link => ({
        url: link.getString('url'),
        label: link.getString('label'),
        icon: link.getString('icon'),
        clusterType: link.getOptionalString('clusterType'),
      }))
    : [];

  const tools = links.map(link => ({
    url: formatTemplateString(link.url, {
      data: deploymentDetailsTemplateData,
    }),
    label: link.label,
    icon: link.icon,
  }));

  const filteredTools = tools.filter(tool => Boolean(tool.url)) as Tool[];
  if (filteredTools.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardContent>
        <Toolkit tools={filteredTools} />
      </CardContent>
    </Card>
  );
}
