import Button from '@material-ui/core/Button';
import EditIcon from '@material-ui/icons/Edit';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { HelmRelease } from '@giantswarm/backstage-plugin-kubernetes-react';
import { useEditAppDeploymentTemplate } from '../../../hooks';
import { useEditDeploymentData } from '../useEditDeploymentData';
import { Box, makeStyles, Tooltip } from '@material-ui/core';

const useStyles = makeStyles(() => ({
  button: {
    textTransform: 'none',
    paddingLeft: 11,
    paddingRight: 11,
  },
}));

export function EditDeploymentButton({
  deployment,
  installationName,
}: {
  deployment: HelmRelease;
  installationName: string;
}) {
  const classes = useStyles();

  const { available, getTemplateUrl } = useEditAppDeploymentTemplate();

  // Only fetch edit data when the template is available
  const {
    entityRef,
    chartRef,
    chartTag,
    automaticUpgrades,
    valuesMode,
    isLoading,
  } = useEditDeploymentData(deployment, installationName, {
    enabled: available,
  });

  const deploymentNamespace = deployment.getNamespace() ?? '';

  const clusterName = deployment.findLabel('giantswarm.io/cluster') ?? '';

  const missingFields = useMemo(() => {
    if (isLoading) return [];
    const missing: string[] = [];
    if (!chartRef) missing.push('chart reference');
    if (!chartTag) missing.push('chart version');
    if (!clusterName) missing.push('cluster name');
    return missing;
  }, [isLoading, chartRef, chartTag, clusterName]);

  const isDisabled = isLoading || missingFields.length > 0;

  let tooltipTitle: string;
  if (isLoading) {
    tooltipTitle = 'Loading deployment data…';
  } else if (missingFields.length > 0) {
    tooltipTitle = `Cannot edit: missing ${missingFields.join(', ')}`;
  } else {
    tooltipTitle = 'Edit deployment';
  }

  const editLink = useMemo(() => {
    if (isDisabled) return undefined;

    return getTemplateUrl({
      entityRef: entityRef ?? '',
      chartRef: chartRef ?? '',
      chartTag: chartTag ?? '',
      automaticUpgrades: automaticUpgrades ?? 'no-upgrades',
      valuesMode: valuesMode ?? 'valuesFrom',
      installation: { installationName },
      cluster: {
        clusterName,
        clusterNamespace: deploymentNamespace,
        isManagementCluster: !deployment.getKubeConfig(),
      },
      name: deployment.getName(),
      targetNamespace: deployment.getTargetNamespace() ?? '',
    });
  }, [
    isDisabled,
    getTemplateUrl,
    entityRef,
    chartRef,
    chartTag,
    automaticUpgrades,
    valuesMode,
    installationName,
    clusterName,
    deployment,
    deploymentNamespace,
  ]);

  if (!available) {
    return null;
  }

  return (
    <Box>
      <Tooltip title={tooltipTitle}>
        <span>
          <Button
            className={classes.button}
            color="inherit"
            size="small"
            startIcon={<EditIcon />}
            component={Link}
            to={editLink ?? ''}
            disabled={isDisabled}
          >
            Edit
          </Button>
        </span>
      </Tooltip>
    </Box>
  );
}
