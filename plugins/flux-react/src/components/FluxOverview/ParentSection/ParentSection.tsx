import {
  GitRepository,
  Kustomization,
  OCIRepository,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { ResourceCard } from '../ResourceCard';
import { InventoryOwner } from '../utils/KustomizationTreeBuilder';
import { Section } from '../../UI';
import { findTargetClusterName } from '../../../utils/findTargetClusterName';
import { findKustomizationSource } from '../../../utils/findKustomizationSource';

type ParentSectionProps = {
  parent?: InventoryOwner | null;
  /**
   * Prefixed to the parent's kind to form the heading, e.g. "Parent ".
   */
  headingPrefix?: string;
  allGitRepositories: GitRepository[];
  allOCIRepositories: OCIRepository[];
};

/**
 * The object whose inventory lists the selected resource: a Kustomization,
 * ResourceSet or FluxInstance.
 */
export const ParentSection = ({
  parent,
  headingPrefix = '',
  allGitRepositories,
  allOCIRepositories,
}: ParentSectionProps) => {
  if (!parent) {
    return null;
  }

  const isKustomization = parent instanceof Kustomization;

  return (
    <Section heading={`${headingPrefix}${parent.getKind()}`}>
      <ResourceCard
        cluster={parent.cluster}
        kind={parent.getKind()}
        name={parent.getName()}
        namespace={parent.getNamespace()}
        targetCluster={
          isKustomization ? findTargetClusterName(parent) : undefined
        }
        resource={parent}
        source={
          isKustomization
            ? findKustomizationSource(
                parent,
                allGitRepositories,
                allOCIRepositories,
              )
            : undefined
        }
      />
    </Section>
  );
};
