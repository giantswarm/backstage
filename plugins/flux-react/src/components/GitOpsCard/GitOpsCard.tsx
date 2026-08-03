import { Box, Typography } from '@material-ui/core';
import { useMemo } from 'react';
import {
  getErrorMessage,
  getHelmReleaseName,
  getHelmReleaseNamespace,
  getIncompatibilityMessage,
  getKustomizationName,
  getKustomizationNamespace,
  GitRepository,
  HelmRelease,
  KubeObject,
  Kustomization,
  useResource,
  useShowErrors,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  AsyncValue,
  ErrorStatus,
  ExternalLink,
  InfoCard,
} from '@giantswarm/backstage-plugin-ui-react';
import { useGitSourceLink } from '../../hooks';
import { GitOpsIcon } from '../../assets/icons';

type GitOpsCardProps = {
  /**
   * Any reconciled resource. Only its Flux labels are read, so this serves an
   * `App`/`HelmRelease` applied straight from a Kustomization as well as an
   * object *rendered by* a HelmRelease (a kagent `Agent`, say), which needs the
   * extra hop below.
   */
  resource: KubeObject;
  installationName: string;
};

export function GitOpsCard({ resource, installationName }: GitOpsCardProps) {
  // A resource applied by a Kustomization carries the link to its source
  // directly. One rendered by a Helm chart does not — the helm-controller only
  // stamps which HelmRelease produced it — so the Kustomization, and with it the
  // Git source, has to be found one level up, on the HelmRelease itself.
  const ownHelmReleaseName = getHelmReleaseName(resource);
  const ownHelmReleaseNamespace = getHelmReleaseNamespace(resource);
  const needsHelmReleaseHop =
    !getKustomizationName(resource) && Boolean(ownHelmReleaseName);

  const {
    resource: ownerHelmRelease,
    errors: helmReleaseErrors,
    isLoading: helmReleaseIsLoading,
    error: helmReleaseError,
    incompatibilities: helmReleaseIncompatibilities,
  } = useResource(
    installationName,
    HelmRelease,
    {
      name: ownHelmReleaseName!,
      namespace: ownHelmReleaseNamespace,
    },
    { enabled: needsHelmReleaseHop },
  );

  const kustomizationOwner = needsHelmReleaseHop ? ownerHelmRelease : resource;
  const kustomizationName = kustomizationOwner
    ? getKustomizationName(kustomizationOwner)
    : undefined;
  const kustomizationNamespace = kustomizationOwner
    ? getKustomizationNamespace(kustomizationOwner)
    : undefined;

  const {
    resource: kustomization,
    errors: kustomizationErrors,
    isLoading: kustomizationIsLoading,
    error: kustomizationError,
    incompatibilities: kustomizationIncompatibilities,
  } = useResource(
    installationName,
    Kustomization,
    {
      name: kustomizationName!,
      namespace: kustomizationNamespace,
    },
    { enabled: Boolean(kustomizationName) },
  );

  const kustomizationSourceRef = kustomization?.getSourceRef();
  const gitRepositoryName = kustomizationSourceRef?.name;
  const gitRepositoryNamespace = kustomizationSourceRef?.namespace;
  const {
    resource: gitRepository,
    errors: gitRepositoryErrors,
    isLoading: gitRepositoryIsLoading,
    error: gitRepositoryError,
    incompatibilities: gitRepositoryIncompatibilities,
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

  // Each stage's `isLoading` is only meaningful once that stage is enabled;
  // a disabled query never resolves, so reading it unguarded would pin the
  // skeleton on forever.
  const isLoading =
    (needsHelmReleaseHop && helmReleaseIsLoading) ||
    (Boolean(kustomizationName) && kustomizationIsLoading) ||
    gitRepositoryIsLoading;

  const errors = useMemo(() => {
    return [
      ...helmReleaseErrors,
      ...kustomizationErrors,
      ...gitRepositoryErrors,
    ];
  }, [gitRepositoryErrors, helmReleaseErrors, kustomizationErrors]);

  useShowErrors(errors);

  let errorMessage;
  if (helmReleaseError) {
    errorMessage = getErrorMessage({
      error: helmReleaseError,
      resourceKind: HelmRelease.kind,
      resourceName: ownHelmReleaseName!,
      resourceNamespace: ownHelmReleaseNamespace,
    });
  }
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
  if (helmReleaseIncompatibilities[0]) {
    errorMessage = getIncompatibilityMessage(helmReleaseIncompatibilities[0]);
  }
  if (kustomizationIncompatibilities[0]) {
    errorMessage = getIncompatibilityMessage(kustomizationIncompatibilities[0]);
  }
  if (gitRepositoryIncompatibilities[0]) {
    errorMessage = getIncompatibilityMessage(gitRepositoryIncompatibilities[0]);
  }

  const sourceUrl = useGitSourceLink({
    url: gitRepositoryUrl,
    revision: gitRepositoryRevision,
    path: kustomizationPath,
  });

  // No Kustomization anywhere up the chain means the resource is reconciled but
  // its desired state is not in Git — a HelmRelease applied by hand or by a
  // scaffolder action, for instance. Rendering "Source · n/a" there implies a
  // link we failed to load, so say nothing at all instead. While the HelmRelease
  // hop is still resolving we don't know yet, so keep the slot.
  const hasGitSource =
    Boolean(kustomizationName) || (needsHelmReleaseHop && helmReleaseIsLoading);

  return (
    <InfoCard>
      <Box display="flex" alignItems="center">
        <Box display="flex" alignItems="center" marginRight={1.5}>
          <GitOpsIcon />
        </Box>
        <Typography variant="inherit">Managed through GitOps</Typography>
        {hasGitSource && (
          <Box marginLeft={1.5} minWidth={75}>
            <AsyncValue
              isLoading={isLoading}
              value={sourceUrl}
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
        )}
      </Box>
    </InfoCard>
  );
}
