import { Button, Tooltip, TooltipTrigger } from '@backstage/ui';
import EditIcon from '@material-ui/icons/Edit';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { HelmRelease } from '@giantswarm/backstage-plugin-kubernetes-react';
import { useEditAppDeploymentTemplate } from '../../../hooks';
import { useEditDeploymentData } from '../useEditDeploymentData';
import { useDeploymentEditCompatibility } from './useDeploymentEditCompatibility';
import {
  findTargetClusterName,
  findTargetClusterNamespace,
} from '../../utils/findTargetCluster';

export function EditDeploymentButton({
  deployment,
  installationName,
}: {
  deployment: HelmRelease;
  installationName: string;
}) {
  const navigate = useNavigate();

  const { available, getTemplateUrl } = useEditAppDeploymentTemplate();

  // Only fetch edit data when the template is available
  const { chartRef, chartTag, automaticUpgrades, isLoading } =
    useEditDeploymentData(deployment, installationName, {
      enabled: available,
    });

  const {
    incompatibleReasons,
    isCompatible,
    isLoading: isLoadingCompatibility,
  } = useDeploymentEditCompatibility(deployment, installationName, {
    enabled: available,
  });

  const name = deployment.getName();
  const namespace = deployment.getNamespace();
  const clusterName = findTargetClusterName(deployment);
  const clusterNamespace = findTargetClusterNamespace(deployment);
  const missingFields = useMemo(() => {
    if (isLoading) return [];
    const missing: string[] = [];
    if (!chartRef) missing.push('chart reference');
    if (!chartTag) missing.push('chart version');
    if (!clusterName) missing.push('cluster name');
    return missing;
  }, [isLoading, chartRef, chartTag, clusterName]);

  const isDisabled =
    isLoading ||
    isLoadingCompatibility ||
    missingFields.length > 0 ||
    !isCompatible;

  let tooltipTitle: string;
  if (isLoading || isLoadingCompatibility) {
    tooltipTitle = 'Loading deployment data…';
  } else if (!isCompatible) {
    tooltipTitle = `Cannot edit: ${incompatibleReasons.join('; ')}`;
  } else if (missingFields.length > 0) {
    tooltipTitle = `Cannot edit: missing ${missingFields.join(', ')}`;
  } else {
    tooltipTitle = 'Edit deployment';
  }

  const editLink = useMemo(() => {
    if (isDisabled) return undefined;

    return getTemplateUrl({
      chartRef: chartRef ?? '',
      chartTag: chartTag ?? '',
      automaticUpgrades: automaticUpgrades ?? 'no-upgrades',
      installation: { installationName },
      cluster: {
        clusterName,
        clusterNamespace,
      },
      name,
      namespace,
    });
  }, [
    isDisabled,
    getTemplateUrl,
    chartRef,
    chartTag,
    automaticUpgrades,
    installationName,
    clusterName,
    clusterNamespace,
    name,
    namespace,
  ]);

  if (!available) {
    return null;
  }

  return (
    <TooltipTrigger>
      <Button
        variant="secondary"
        iconStart={<EditIcon fontSize="inherit" />}
        isDisabled={isDisabled}
        onClick={() => {
          if (editLink) {
            navigate(editLink);
          }
        }}
      >
        Edit
      </Button>
      <Tooltip>{tooltipTitle}</Tooltip>
    </TooltipTrigger>
  );
}
