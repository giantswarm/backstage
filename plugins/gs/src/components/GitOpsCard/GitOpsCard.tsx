import { Box, Card, CardContent, Typography } from '@material-ui/core';
import {
  Deployment,
  getAppKustomizationName,
  getAppKustomizationNamespace,
  getGitRepositoryKind,
  getGitRepositoryRevision,
  getGitRepositoryUrl,
  getHelmReleaseKustomizationName,
  getHelmReleaseKustomizationNamespace,
  getKustomizationPath,
  getKustomizationSourceRef,
  GitRepository,
  GitRepositoryKind,
  Kustomization,
  KustomizationKind,
} from '@giantswarm/backstage-plugin-gs-common';
import { useGitOpsSourceLink, useResource } from '../hooks';
import { GitOpsIcon } from '../../assets/icons/CustomIcons';
import { AsyncValue, ExternalLink } from '../UI';
import { useShowErrors } from '../Errors/useErrors';
import { useMemo } from 'react';
import { ErrorStatus } from '../UI/ErrorStatus/ErrorStatus';

type GitOpsCardProps = {
  deployment: Deployment;
  installationName: string;
};

export function GitOpsCard({ deployment, installationName }: GitOpsCardProps) {
  const kustomizationName =
    deployment.kind === 'App'
      ? getAppKustomizationName(deployment)
      : getHelmReleaseKustomizationName(deployment);
  const kustomizationNamespace =
    deployment.kind === 'App'
      ? getAppKustomizationNamespace(deployment)
      : getHelmReleaseKustomizationNamespace(deployment);
  const {
    data: kustomization,
    errors: kustomizationErrors,
    isLoading: kustomizationIsLoading,
    error: kustomizationError,
    queryErrorMessage: kustomizationQueryErrorMessage,
  } = useResource<Kustomization>({
    kind: KustomizationKind,
    installationName,
    name: kustomizationName!,
    namespace: kustomizationNamespace,
  });

  const kustomizationSourceRef = kustomization
    ? getKustomizationSourceRef(kustomization)
    : undefined;
  const {
    data: gitRepository,
    errors: gitRepositoryErrors,
    isLoading: gitRepositoryIsLoading,
    error: gitRepositoryError,
    queryErrorMessage: gitRepositoryQueryErrorMessage,
  } = useResource<GitRepository>(
    {
      kind: GitRepositoryKind,
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

  const errors = useMemo(() => {
    return [...kustomizationErrors, ...gitRepositoryErrors];
  }, [gitRepositoryErrors, kustomizationErrors]);

  useShowErrors(errors);

  const firstError = errors[0]?.error ?? null;
  let errorMessage;
  if (kustomizationError) {
    errorMessage = kustomizationQueryErrorMessage;
  }
  if (gitRepositoryError) {
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
              error={firstError}
              errorMessage={errorMessage}
              renderError={message => (
                <ErrorStatus errorMessage={message} notAvailable={false} />
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
