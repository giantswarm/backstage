import React from 'react';
import {
  Box,
  Card,
  CardContent,
  styled,
  Tooltip,
  Typography,
} from '@material-ui/core';
import InfoOutlinedIcon from '@material-ui/icons/InfoOutlined';
import { useCurrentCluster } from '../../../ClusterDetailsPage/useCurrentCluster';
import { GitOpsIcon } from '../../../../../assets/icons/CustomIcons';
import { AsyncValue, ExternalLink } from '../../../../UI';
import {
  App,
  getAppKustomizationName,
  getAppKustomizationNamespace,
  getGitRepositoryKind,
  getGitRepositoryRevision,
  getGitRepositoryUrl,
  getKustomizationPath,
  getKustomizationSourceRef,
} from '@giantswarm/backstage-plugin-gs-common';
import { useGitRepository, useKustomization } from '../../../../hooks';
import { useGitOpsSourceLink } from '../../../../hooks/useClusterLinks';

const InfoIcon = styled(InfoOutlinedIcon)(({ theme }) => ({
  color: theme.palette.text.secondary,
}));

type ClusterGitOpsCardProps = {
  clusterApp: App;
};

export function ClusterGitOpsCard({ clusterApp }: ClusterGitOpsCardProps) {
  const { installationName } = useCurrentCluster();

  const kustomizationName = getAppKustomizationName(clusterApp);
  const kustomizationNamespace = getAppKustomizationNamespace(clusterApp);
  const {
    data: kustomization,
    isLoading: kustomizationIsLoading,
    error: kustomizationError,
    queryErrorMessage: kustomizationQueryErrorMessage,
  } = useKustomization({
    installationName,
    name: kustomizationName!,
    namespace: kustomizationNamespace,
  });

  const kustomizationSourceRef = kustomization
    ? getKustomizationSourceRef(kustomization)
    : undefined;
  const {
    data: gitRepository,
    isLoading: gitRepositoryIsLoading,
    error: gitRepositoryError,
    queryErrorMessage: gitRepositoryQueryErrorMessage,
  } = useGitRepository(
    {
      installationName,
      name: kustomizationSourceRef?.name!,
      namespace: kustomizationSourceRef?.namespace,
    },
    {
      enabled: Boolean(
        kustomizationSourceRef &&
          kustomizationSourceRef.kind === getGitRepositoryKind(),
      ),
    },
  );

  const kustomizationPath = kustomization
    ? getKustomizationPath(kustomization)
    : undefined;

  const gitRepositoryUrl = gitRepository
    ? getGitRepositoryUrl(gitRepository)
    : undefined;

  const gitRepositoryRevision = gitRepository
    ? getGitRepositoryRevision(gitRepository)
    : undefined;

  const isLoading = kustomizationIsLoading || gitRepositoryIsLoading;

  let error;
  let errorMessage;
  if (kustomizationError) {
    error = kustomizationError;
    errorMessage = kustomizationQueryErrorMessage;
  }
  if (gitRepositoryError) {
    error = gitRepositoryError;
    errorMessage = gitRepositoryQueryErrorMessage;
  }

  const sourceUrl = useGitOpsSourceLink({
    url: gitRepositoryUrl,
    revision: gitRepositoryRevision,
    path: kustomizationPath,
  });

  return (
    <Card>
      <CardContent>
        <Box display="flex" alignItems="center">
          <Box display="flex" alignItems="center" marginRight={1.5}>
            <GitOpsIcon />
          </Box>
          <Typography variant="inherit">Managed through GitOps</Typography>
          <Box marginLeft={1.5} minWidth={75}>
            <AsyncValue
              isLoading={isLoading}
              value={sourceUrl}
              error={error}
              errorMessage={errorMessage}
              renderError={message => (
                <Box display="flex" alignItems="center">
                  <Tooltip
                    title={`Source link cannot be provided. Reason: ${message}`}
                  >
                    <InfoIcon />
                  </Tooltip>
                </Box>
              )}
            >
              {value => (
                <Box display="flex" alignItems="center">
                  <Box marginLeft={-0.5} marginRight={1}>
                    <Typography variant="inherit">·</Typography>
                  </Box>
                  <ExternalLink href={value}>Source</ExternalLink>
                </Box>
              )}
            </AsyncValue>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}
