import {
  HelmRelease,
  Kustomization,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { Box, makeStyles } from '@material-ui/core';
import { Status } from '../../../UI/Status';

const useStyles = makeStyles(theme => ({
  root: {
    position: 'absolute',
    top: theme.spacing(1),
    right: theme.spacing(2),
  },
}));

const KustomizationStatus = ({
  kustomization,
}: {
  kustomization: Kustomization;
}) => {
  return <Status text="Ready" status="ok" />;
};

const HelmReleaseStatus = ({ helmRelease }: { helmRelease: HelmRelease }) => {
  return <Status text="Not ready" status="error" />;
};

type ResourceStatusProps = {
  resource: Kustomization | HelmRelease;
};

export const ResourceStatus = ({ resource }: ResourceStatusProps) => {
  const classes = useStyles();

  return (
    <Box className={classes.root}>
      {resource.getKind() === Kustomization.kind ? (
        <KustomizationStatus kustomization={resource as Kustomization} />
      ) : null}
      {resource.getKind() === HelmRelease.kind ? (
        <HelmReleaseStatus helmRelease={resource as HelmRelease} />
      ) : null}
    </Box>
  );
};
