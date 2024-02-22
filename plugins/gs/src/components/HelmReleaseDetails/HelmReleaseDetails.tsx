import React from "react";
import { EmptyState, Progress, WarningPanel } from "@backstage/core-components";
import { Box, Card, CardContent, CardHeader, Grid } from "@material-ui/core";
import { useHelmRelease } from "../hooks";
import { StructuredMetadataList } from "../UI/StructuredMetadataList";
import { RevisionDetails } from "../RevisionDetails/RevisionDetails";
import { HelmReleaseDetailsStatus } from "../HelmReleaseDetailsStatus";
import DateComponent from "../UI/Date";
import {
  getHelmReleaseClusterName,
  getHelmReleaseLastAppliedRevision,
  getHelmReleaseLastAttemptedRevision,
} from "../../model/services/mapi/helmv2beta1";
import { Heading } from "../UI/Heading";
import { formatVersion } from "../utils/helpers";
import { GitOpsUILink } from "../UI/GitOpsUILink/GitOpsUILink";

type HelmReleaseDetailsProps = {
  installationName: string;
  namespace: string;
  name: string;
  sourceLocation?: string;
}

export const HelmReleaseDetails = ({
  installationName,
  namespace,
  name,
  sourceLocation,
}: HelmReleaseDetailsProps) => {
  const {
    data: helmrelease,
    isLoading,
    error,
  } = useHelmRelease(installationName, name, namespace);

  if (isLoading) {
    return <Progress />;
  }

  if (error) {
    return (
      <WarningPanel severity="error" title={`Could not load ${namespace}/${name} resource.`}>
        {(error as Error).message}
      </WarningPanel>
    );
  }

  if (!helmrelease) {
    return (
      <EmptyState
        missing="info"
        title="No HelmRelease found"
        description={`HelmRelease ${installationName}:${namespace}/${name} was not found`}
      />
    );
  }

  const clusterName = getHelmReleaseClusterName(helmrelease);
  const lastAppliedRevision = formatVersion(getHelmReleaseLastAppliedRevision(helmrelease) ?? '');
  const lastAttemptedRevision = formatVersion(getHelmReleaseLastAttemptedRevision(helmrelease) ?? '');
  
  return (
    <div>
      <Box display='flex' marginBottom={2}>
        <GitOpsUILink
          installationName={installationName}
          clusterName={installationName}
          kind='helmrelease'
          name={name}
          namespace={namespace}
        />
      </Box>

      <Box marginBottom={4}>
        <StructuredMetadataList metadata={{
          'Installation': installationName,
          'Cluster': clusterName ? clusterName : 'n/a',
        }} />
      </Box>
      
      <Grid container direction="column">
        <Grid item>
          <RevisionDetails
            lastAppliedRevision={lastAppliedRevision}
            lastAttemptedRevision={lastAttemptedRevision}
            sourceLocation={sourceLocation}
          />
        </Grid>

        <Grid item>
          <HelmReleaseDetailsStatus helmrelease={helmrelease} />
        </Grid>

        <Grid item>
          <Card>
            <CardHeader
              title={<Heading>HelmRelease</Heading>}
              titleTypographyProps={{ variant: undefined }}
            />
            <CardContent>
              <StructuredMetadataList metadata={{
                'Namespace': namespace,
                'Name': name,
                'Created': (
                  <DateComponent
                    value={helmrelease.metadata.creationTimestamp}
                    relative
                  />
                ),
              }} />
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </div>
  );
}
