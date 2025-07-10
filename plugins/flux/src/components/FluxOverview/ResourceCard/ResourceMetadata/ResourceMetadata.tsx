import {
  HelmRelease,
  Kustomization,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  ConditionMessage,
  DateComponent,
  NotAvailable,
  StructuredMetadataList,
} from '@giantswarm/backstage-plugin-ui-react';
import { Box, makeStyles } from '@material-ui/core';

const useStyles = makeStyles(theme => ({
  root: {},
}));

const KustomizationMetadata = ({
  kustomization,
}: {
  kustomization: Kustomization;
}) => {
  const revision = kustomization.getLastAppliedRevision();
  const readyCondition = kustomization.findStatusCondition();

  const metadata: { [key: string]: any } = {
    Path: kustomization.getPath(),
    Revision: revision ? revision : <NotAvailable />,
  };

  if (readyCondition) {
    metadata.Status = (
      <>
        Last reconciled at{' '}
        <DateComponent value={readyCondition.lastTransitionTime} />
      </>
    );
    metadata.Message = <ConditionMessage message={readyCondition.message} />;
  } else {
    metadata.Status = 'Unknown';
  }

  return (
    <StructuredMetadataList metadata={metadata} fixedKeyColumnWidth="60px" />
  );
};

type ResourceMetadataProps = {
  resource: Kustomization | HelmRelease;
};

export const ResourceMetadata = ({ resource }: ResourceMetadataProps) => {
  const classes = useStyles();

  return (
    <Box className={classes.root} mt={3} px={2}>
      {resource.getKind() === Kustomization.kind ? (
        <KustomizationMetadata kustomization={resource as Kustomization} />
      ) : null}
    </Box>
  );
};
