import { Box, Card, CardContent, Typography } from '@material-ui/core';
import { useGitOpsSourceLink } from '../hooks';
import { GitOpsIcon } from '../../assets/icons/CustomIcons';
import { AsyncValue, ExternalLink } from '../UI';
import { useMemo } from 'react';
import { ErrorStatus } from '../UI/ErrorStatus/ErrorStatus';
import {
  getKustomizationName,
  getKustomizationNamespace,
} from '../deployments/utils/isManagedByFlux';
import {
  App,
  GitRepository,
  HelmRelease,
  Kustomization,
  useResource,
  useShowErrors,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { getErrorMessage } from '../hooks/utils/helpers';

type GitOpsCardProps = {
  deployment: App | HelmRelease;
  installationName: string;
};

export function GitOpsCard({ deployment, installationName }: GitOpsCardProps) {
  const kustomizationName = getKustomizationName(deployment);
  const kustomizationNamespace = getKustomizationNamespace(deployment);

  const {
    resource: kustomization,
    errors: kustomizationErrors,
    isLoading: kustomizationIsLoading,
    error: kustomizationError,
  } = useResource(installationName, Kustomization, {
    name: kustomizationName!,
    namespace: kustomizationNamespace,
  });

  const kustomizationSourceRef = kustomization?.getSourceRef();
  const gitRepositoryName = kustomizationSourceRef?.name;
  const gitRepositoryNamespace = kustomizationSourceRef?.namespace;
  const {
    resource: gitRepository,
    errors: gitRepositoryErrors,
    isLoading: gitRepositoryIsLoading,
    error: gitRepositoryError,
  } = useResource(
    installationName,
    GitRepository,
    {
      name: gitRepositoryName!,
      namespace: gitRepositoryNamespace,
    },
    {
      enabled: Boolean(
        kustomizationSourceRef &&
          kustomizationSourceRef.kind === GitRepository.kind,
      ),
    },
  );

  const kustomizationPath = kustomization?.getPath();
  const gitRepositoryUrl = gitRepository?.getURL();
  const gitRepositoryRevision = gitRepository?.getRevision();

  const isLoading = kustomizationIsLoading || gitRepositoryIsLoading;

  const errors = useMemo(() => {
    return [...kustomizationErrors, ...gitRepositoryErrors];
  }, [gitRepositoryErrors, kustomizationErrors]);

  useShowErrors(errors);

  const firstError = errors[0]?.error ?? null;
  let errorMessage;
  if (kustomizationError) {
    errorMessage = getErrorMessage({
      error: kustomizationError,
      resourceKind: Kustomization.kind,
      resourceName: kustomizationName!,
      resourceNamespace: kustomizationNamespace,
    });
  }
  if (gitRepositoryError) {
    errorMessage = getErrorMessage({
      error: gitRepositoryError,
      resourceKind: GitRepository.kind,
      resourceName: gitRepositoryName!,
      resourceNamespace: gitRepositoryNamespace,
    });
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
