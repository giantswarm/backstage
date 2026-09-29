import {
  KubeObject,
  useShowErrors,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  GitOpsManagedLabel,
  InfoCard,
} from '@giantswarm/backstage-plugin-ui-react';
import { useGitOpsSource } from '../../hooks';

type GitOpsCardProps = {
  /**
   * Any reconciled resource. Only its Flux labels are read, so this serves an
   * `App`/`HelmRelease` applied straight from a Kustomization as well as an
   * object *rendered by* a HelmRelease (a kagent `Agent`, say), which needs the
   * extra hop (see `useGitOpsSource`).
   */
  resource: KubeObject;
  installationName: string;
};

/**
 * "Managed through GitOps", with a link to the resource's definition in Git.
 *
 * Renders **nothing** for a resource whose desired state is not actually in Git.
 * Being reconciled by Flux is not the same as being GitOps-managed: a HelmRelease
 * applied by hand — or by a scaffolder action, which is how the agent-platform
 * create flow deploys an agent — produces a resource with Flux labels and no Git
 * source at all. Claiming GitOps there is wrong in the way that matters, because
 * it tells the reader to go and edit a file that does not exist.
 *
 * The test for "in Git" is a `Kustomization` somewhere up the chain, since that is
 * what carries a source reference. Callers that have already established this (the
 * gs cluster and deployment pages gate on `isManagedByFlux`) are unaffected.
 */
export function GitOpsCard({ resource, installationName }: GitOpsCardProps) {
  const { inGit, isLoading, url, errorMessage, errors } = useGitOpsSource(
    resource,
    installationName,
  );

  // Reported only once a Kustomization is known, which means the card *is*
  // rendering and can show the failure in place of its link.
  useShowErrors(errors);

  // No Kustomization anywhere up the chain means the resource is reconciled but
  // its desired state is not in Git, so there is no GitOps claim to make and no
  // source to link — render nothing at all rather than a claim the reader cannot
  // act on. Rendering nothing while the HelmRelease hop resolves, rather than a
  // card that then disappears, keeps us from asserting it and taking it back.
  //
  // A *failed* hop lands here too, which means "we could not tell" renders
  // identically to "definitely not in Git". That is the conservative side to err
  // on: the card's only job is to assert a Git source, and a failed lookup is no
  // basis for asserting one. Claiming GitOps off the Helm label alone would be
  // wrong for every agent this plugin deploys.
  if (!inGit) {
    return null;
  }

  return (
    <InfoCard>
      <GitOpsManagedLabel source={{ url, isLoading, errorMessage }} />
    </InfoCard>
  );
}
