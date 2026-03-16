import Button from '@material-ui/core/Button';
import EditIcon from '@material-ui/icons/Edit';
import { useMemo } from 'react';
import { HelmRelease } from '@giantswarm/backstage-plugin-kubernetes-react';
import { useAppDeploymentTemplate } from '../../../hooks';
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

  const { available, getTemplateUrl } = useAppDeploymentTemplate();

  // Only fetch edit data when the template is available
  const { entityRef, chartRef, chartTag, automaticUpgrades, isLoading } =
    useEditDeploymentData(deployment, installationName, {
      enabled: available,
    });

  const deploymentNamespace = deployment.getNamespace() ?? '';

  const editLink = useMemo(() => {
    return getTemplateUrl({
      _editMode: true,
      entityRef: entityRef ?? '',
      chartRef: chartRef ?? '',
      chartTag: chartTag ?? '',
      automaticUpgrades: automaticUpgrades ?? 'no-upgrades',
      installation: { installationName },
      cluster: {
        clusterName: deployment.findLabel('giantswarm.io/cluster') ?? '',
        clusterNamespace: deploymentNamespace,
      },
      name: deployment.getName(),
      targetNamespace: deployment.getTargetNamespace() ?? '',
    });
  }, [
    getTemplateUrl,
    entityRef,
    chartRef,
    chartTag,
    automaticUpgrades,
    installationName,
    deployment,
    deploymentNamespace,
  ]);

  if (!available) {
    return null;
  }

  return (
    <Box>
      <Tooltip title="Edit deployment">
        <Button
          className={classes.button}
          color="inherit"
          size="small"
          startIcon={<EditIcon />}
          href={editLink}
          disabled={isLoading}
        >
          Edit
        </Button>
      </Tooltip>
    </Box>
  );
}
