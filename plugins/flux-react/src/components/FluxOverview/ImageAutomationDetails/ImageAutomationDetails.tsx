import {
  ImagePolicy,
  ImageRepository,
  ImageUpdateAutomation,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { Box } from '@material-ui/core';
import { ResourceCard } from '../ResourceCard';
import { Section } from '../../UI';
import { KustomizationTreeBuilder } from '../utils/KustomizationTreeBuilder';
import { findTargetClusterName } from '../../../utils/findTargetClusterName';

function findImageRepository(
  imagePolicy: ImagePolicy,
  allImageRepositories: ImageRepository[],
): ImageRepository | undefined {
  const imageRepositoryRef = imagePolicy.getImageRepositoryRef();
  if (!imageRepositoryRef) {
    return undefined;
  }

  const name = imageRepositoryRef.name;
  const namespace = imageRepositoryRef.namespace ?? imagePolicy.getNamespace();

  return allImageRepositories.find(
    r =>
      r.getName() === name &&
      r.getNamespace() === namespace &&
      r.cluster === imagePolicy.cluster,
  );
}

type ImageAutomationDetailsProps = {
  resource: ImagePolicy | ImageRepository | ImageUpdateAutomation;
  allImageRepositories: ImageRepository[];
  treeBuilder?: KustomizationTreeBuilder;
};

export const ImageAutomationDetails = ({
  resource,
  allImageRepositories,
  treeBuilder,
}: ImageAutomationDetailsProps) => {
  const parentImageRepository =
    resource instanceof ImagePolicy
      ? findImageRepository(resource, allImageRepositories)
      : undefined;

  const parentKustomization =
    resource instanceof ImageRepository
      ? treeBuilder?.findParentKustomization(resource)
      : undefined;

  return (
    <Box>
      <Section heading={`This ${resource.getKind()}`}>
        <ResourceCard
          cluster={resource.cluster}
          kind={resource.getKind()}
          name={resource.getName()}
          namespace={resource.getNamespace()}
          resource={resource}
          highlighted
        />
      </Section>

      {parentKustomization ? (
        <Section heading="Kustomization">
          <ResourceCard
            cluster={parentKustomization.cluster}
            kind={parentKustomization.getKind()}
            name={parentKustomization.getName()}
            namespace={parentKustomization.getNamespace()}
            targetCluster={findTargetClusterName(parentKustomization)}
            resource={parentKustomization}
          />
        </Section>
      ) : null}

      {parentImageRepository ? (
        <Section heading="ImageRepository">
          <ResourceCard
            cluster={parentImageRepository.cluster}
            kind={parentImageRepository.getKind()}
            name={parentImageRepository.getName()}
            namespace={parentImageRepository.getNamespace()}
            resource={parentImageRepository}
          />
        </Section>
      ) : null}
    </Box>
  );
};
