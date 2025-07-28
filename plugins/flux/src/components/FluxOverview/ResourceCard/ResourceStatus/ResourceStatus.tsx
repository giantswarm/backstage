import {
  HelmRelease,
  Kustomization,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { Box, makeStyles } from '@material-ui/core';
import { Status } from '../../../UI/Status';
import { useEffect, useRef } from 'react';

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
  const readyCondition = kustomization.findReadyCondition();

  const status = useRef(readyCondition?.status || 'Unknown');

  useEffect(() => {
    if (
      !readyCondition?.status ||
      readyCondition.status === status.current ||
      readyCondition.status === 'Unknown'
    ) {
      return;
    }

    status.current = readyCondition.status;
  }, [readyCondition?.status]);

  let elText = 'Unknown';
  let elStatus: 'aborted' | 'ok' | 'error' = 'aborted';
  if (status.current === 'True') {
    elText = 'Ready';
    elStatus = 'ok';
  } else if (status.current === 'False') {
    elText = 'Not ready';
    elStatus = 'error';
  }
  if (kustomization.isReconciling()) {
    elText += ', reconciling';
  }

  return <Status text={elText} status={elStatus} />;
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
