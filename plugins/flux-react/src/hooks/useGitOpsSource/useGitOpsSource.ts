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
} from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  ChangeRequestTerm,
  getChangeRequestTerm,
} from '../../utils/getChangeRequestTerm';
import { useGitSourceLink } from '../useGitSourceLink';

export type GitOpsSource = {
  /**
   * A Kustomization was found up the chain, i.e. the resource's desired state
   * is in Git. False while the HelmRelease hop is still resolving.
   */
  inGit: boolean;
  isLoading: boolean;
  /** Link to the Kustomization's path in the Git source, once resolved. */
  url?: string;
  /**
   * What the Git host calls a proposed change ("pull request" or "merge
   * request"), once the GitRepository is known.
   */
  changeRequestTerm?: ChangeRequestTerm;
  /**
   * Why no `url`, or no Git source at all, could be resolved — for display in
   * place of the link.
   */
  errorMessage?: string;
  /**
   * Kustomization and GitRepository lookup errors, for the caller to report
   * (e.g. with `useShowErrors`) or not.
   */
  errors: ReturnType<typeof useResource>['errors'];
  kustomization?: { name: string; namespace?: string; path?: string };
  /**
   * The HelmRelease the Kustomization was found through, when the resource is
   * chart-rendered — the outermost one, if a chart rendered that release too.
   * Its desired state is then chart values in Git, not a manifest of the
   * resource itself.
   */
  helmRelease?: { name: string; namespace?: string };
};

function outermostHelmRelease(
  ...releases: ({ name?: string; namespace?: string } | undefined)[]
): GitOpsSource['helmRelease'] {
  const release = releases.find(r => r?.name);
  return release?.name
    ? { name: release.name, namespace: release.namespace }
    : undefined;
}

/**
 * Resolves where in Git a reconciled resource is defined: resource →
 * (HelmRelease → (HelmRelease)) → Kustomization → GitRepository.
 *
 * Only the resource's Flux labels are read, so this serves an object applied
 * straight from a Kustomization as well as one *rendered by* a HelmRelease (a
 * kagent `Agent`, say), which needs the extra hop.
 */
export function useGitOpsSource(
  resource: KubeObject,
  installationName: string,
): GitOpsSource {
  // A resource applied by a Kustomization carries the link to its source
  // directly. One rendered by a Helm chart does not — the helm-controller only
  // stamps which HelmRelease produced it — so the Kustomization, and with it the
  // Git source, has to be found one level up, on the HelmRelease itself.
  const ownHelmReleaseName = getHelmReleaseName(resource);
  const ownHelmReleaseNamespace = getHelmReleaseNamespace(resource);
  const needsHelmReleaseHop =
    !getKustomizationName(resource) && Boolean(ownHelmReleaseName);

  // The hops' failures are kept out of `errors` — see the note there.
  const {
    resource: ownerHelmRelease,
    isLoading: helmReleaseIsLoading,
    error: helmReleaseError,
  } = useResource(
    installationName,
    HelmRelease,
    {
      name: ownHelmReleaseName!,
      namespace: ownHelmReleaseNamespace,
    },
    { enabled: needsHelmReleaseHop },
  );

  // An umbrella chart renders HelmReleases of its own (agent-platform renders
  // agent-platform-mcps, which renders the MCPServers), so the owner may itself
  // be chart-rendered. One more hop covers that; deeper nesting stays unresolved.
  const outerHelmReleaseName = ownerHelmRelease
    ? getHelmReleaseName(ownerHelmRelease)
    : undefined;
  const outerHelmReleaseNamespace = ownerHelmRelease
    ? getHelmReleaseNamespace(ownerHelmRelease)
    : undefined;
  const needsOuterHelmReleaseHop =
    needsHelmReleaseHop &&
    Boolean(ownerHelmRelease) &&
    !getKustomizationName(ownerHelmRelease!) &&
    Boolean(outerHelmReleaseName);

  const {
    resource: outerHelmRelease,
    isLoading: outerHelmReleaseIsLoading,
    error: outerHelmReleaseError,
  } = useResource(
    installationName,
    HelmRelease,
    {
      name: outerHelmReleaseName!,
      namespace: outerHelmReleaseNamespace,
    },
    { enabled: needsOuterHelmReleaseHop },
  );

  let kustomizationOwner: KubeObject | undefined = resource;
  if (needsOuterHelmReleaseHop) {
    kustomizationOwner = outerHelmRelease;
  } else if (needsHelmReleaseHop) {
    kustomizationOwner = ownerHelmRelease;
  }
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
  const gitRepositoryEnabled = Boolean(
    kustomizationSourceRef &&
    kustomizationSourceRef.kind === GitRepository.kind,
  );
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
    { enabled: gitRepositoryEnabled },
  );

  const kustomizationPath = kustomization?.getPath();
  const gitRepositoryUrl = gitRepository?.getURL();
  const gitRepositoryRevision = gitRepository?.getRevision();

  // Each stage's `isLoading` is only meaningful once that stage is enabled:
  // it also covers API discovery, which runs for a disabled query too, and a
  // disabled query never resolves.
  const helmReleaseHopsLoading =
    (needsHelmReleaseHop && helmReleaseIsLoading) ||
    (needsOuterHelmReleaseHop && outerHelmReleaseIsLoading);
  const isLoading =
    helmReleaseHopsLoading ||
    (Boolean(kustomizationName) && kustomizationIsLoading) ||
    (gitRepositoryEnabled && gitRepositoryIsLoading);

  // The HelmRelease hops' failures are deliberately left out of `errors`. Each
  // is a lookup started only to find out *whether* there is a Git source, and a
  // failure means `inGit` stays false — so a "Failed to load HelmRelease" notice
  // would be about a source the reader is never shown. A reader without RBAC on
  // HelmReleases would get it on every resource they open. They do reach
  // `errorMessage`, for a caller that explains a missing source in place.
  //
  // The other two only fail once a Kustomization is known, which means there
  // *is* a source to show, and the failure can take the link's place.
  const errors = useMemo(() => {
    return [...kustomizationErrors, ...gitRepositoryErrors];
  }, [gitRepositoryErrors, kustomizationErrors]);

  let errorMessage;
  if (needsHelmReleaseHop && helmReleaseError) {
    errorMessage = getErrorMessage({
      error: helmReleaseError,
      resourceKind: HelmRelease.kind,
      resourceName: ownHelmReleaseName!,
      resourceNamespace: ownHelmReleaseNamespace,
    });
  }
  if (needsOuterHelmReleaseHop && outerHelmReleaseError) {
    errorMessage = getErrorMessage({
      error: outerHelmReleaseError,
      resourceKind: HelmRelease.kind,
      resourceName: outerHelmReleaseName!,
      resourceNamespace: outerHelmReleaseNamespace,
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
  if (kustomizationIncompatibilities[0]) {
    errorMessage = getIncompatibilityMessage(kustomizationIncompatibilities[0]);
  }
  if (gitRepositoryIncompatibilities[0]) {
    errorMessage = getIncompatibilityMessage(gitRepositoryIncompatibilities[0]);
  }

  const url = useGitSourceLink({
    url: gitRepositoryUrl,
    revision: gitRepositoryRevision,
    path: kustomizationPath,
  });

  return {
    inGit: Boolean(kustomizationName),
    isLoading,
    url,
    changeRequestTerm: gitRepositoryUrl
      ? getChangeRequestTerm(gitRepositoryUrl)
      : undefined,
    errorMessage,
    errors,
    kustomization: kustomizationName
      ? {
          name: kustomizationName,
          namespace: kustomizationNamespace,
          path: kustomizationPath,
        }
      : undefined,
    // Withheld until the hops settle: before the outer one resolves, the inner
    // release would be named, and it is not the one whose values to change.
    helmRelease: helmReleaseHopsLoading
      ? undefined
      : outermostHelmRelease(
          needsOuterHelmReleaseHop
            ? {
                name: outerHelmReleaseName,
                namespace: outerHelmReleaseNamespace,
              }
            : undefined,
          needsHelmReleaseHop
            ? { name: ownHelmReleaseName, namespace: ownHelmReleaseNamespace }
            : undefined,
        ),
  };
}
