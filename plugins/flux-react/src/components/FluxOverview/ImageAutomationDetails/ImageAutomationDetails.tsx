import {
  GitRepository,
  ImagePolicy,
  ImageRepository,
  ImageUpdateAutomation,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { Box, Grid } from '@material-ui/core';
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

function findChildImagePolicies(
  imageRepository: ImageRepository,
  allImagePolicies: ImagePolicy[],
): ImagePolicy[] {
  const repoName = imageRepository.getName();
  const repoNamespace = imageRepository.getNamespace();
  const repoCluster = imageRepository.cluster;

  return allImagePolicies.filter(policy => {
    if (policy.cluster !== repoCluster) {
      return false;
    }

    const ref = policy.getImageRepositoryRef();
    if (!ref) {
      return false;
    }

    const refNamespace = ref.namespace ?? policy.getNamespace();
    return ref.name === repoName && refNamespace === repoNamespace;
  });
}

function findSourceGitRepository(
  imageUpdateAutomation: ImageUpdateAutomation,
  allGitRepositories: GitRepository[],
): GitRepository | undefined {
  const sourceRef = imageUpdateAutomation.getSourceRef();
  if (!sourceRef || sourceRef.kind !== 'GitRepository') {
    return undefined;
  }

  const name = sourceRef.name;
  const namespace = sourceRef.namespace ?? imageUpdateAutomation.getNamespace();

  return allGitRepositories.find(
    r =>
      r.getName() === name &&
      r.getNamespace() === namespace &&
      r.cluster === imageUpdateAutomation.cluster,
  );
}

type ImagePolicyDetailsProps = {
  imagePolicy: ImagePolicy;
  parentImageRepository?: ImageRepository;
  parentKustomization?: ReturnType<
    KustomizationTreeBuilder['findParentKustomization']
  >;
};

const ImagePolicyDetails = ({
  imagePolicy,
  parentImageRepository,
  parentKustomization,
}: ImagePolicyDetailsProps) => {
  return (
    <Box>
      <Section heading="This ImagePolicy">
        <ResourceCard
          cluster={imagePolicy.cluster}
          kind={imagePolicy.getKind()}
          name={imagePolicy.getName()}
          namespace={imagePolicy.getNamespace()}
          resource={imagePolicy}
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

type ImageRepositoryDetailsProps = {
  imageRepository: ImageRepository;
  childImagePolicies: ImagePolicy[];
  parentKustomization?: ReturnType<
    KustomizationTreeBuilder['findParentKustomization']
  >;
};

const ImageRepositoryDetails = ({
  imageRepository,
  childImagePolicies,
  parentKustomization,
}: ImageRepositoryDetailsProps) => {
  return (
    <Box>
      <Section heading="This ImageRepository">
        <ResourceCard
          cluster={imageRepository.cluster}
          kind={imageRepository.getKind()}
          name={imageRepository.getName()}
          namespace={imageRepository.getNamespace()}
          resource={imageRepository}
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

      {childImagePolicies.length > 0 ? (
        <Section heading="ImagePolicies">
          <Grid container spacing={2}>
            {childImagePolicies.map(policy => (
              <Grid
                item
                xs={12}
                key={`${policy.cluster}-${policy.getKind()}-${policy.getNamespace()}-${policy.getName()}`}
              >
                <ResourceCard
                  cluster={policy.cluster}
                  kind={policy.getKind()}
                  name={policy.getName()}
                  namespace={policy.getNamespace()}
                  resource={policy}
                />
              </Grid>
            ))}
          </Grid>
        </Section>
      ) : null}
    </Box>
  );
};

type ImageUpdateAutomationDetailsProps = {
  imageUpdateAutomation: ImageUpdateAutomation;
  sourceGitRepository?: GitRepository;
  parentKustomization?: ReturnType<
    KustomizationTreeBuilder['findParentKustomization']
  >;
};

const ImageUpdateAutomationDetails = ({
  imageUpdateAutomation,
  sourceGitRepository,
  parentKustomization,
}: ImageUpdateAutomationDetailsProps) => {
  return (
    <Box>
      <Section heading="This ImageUpdateAutomation">
        <ResourceCard
          cluster={imageUpdateAutomation.cluster}
          kind={imageUpdateAutomation.getKind()}
          name={imageUpdateAutomation.getName()}
          namespace={imageUpdateAutomation.getNamespace()}
          resource={imageUpdateAutomation}
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

      {sourceGitRepository ? (
        <Section heading="Source">
          <ResourceCard
            cluster={sourceGitRepository.cluster}
            kind={sourceGitRepository.getKind()}
            name={sourceGitRepository.getName()}
            namespace={sourceGitRepository.getNamespace()}
            resource={sourceGitRepository}
          />
        </Section>
      ) : null}
    </Box>
  );
};

type ImageAutomationDetailsProps = {
  resource: ImagePolicy | ImageRepository | ImageUpdateAutomation;
  allImagePolicies: ImagePolicy[];
  allImageRepositories: ImageRepository[];
  allGitRepositories: GitRepository[];
  treeBuilder?: KustomizationTreeBuilder;
};

export const ImageAutomationDetails = ({
  resource,
  allImagePolicies,
  allImageRepositories,
  allGitRepositories,
  treeBuilder,
}: ImageAutomationDetailsProps) => {
  if (resource instanceof ImagePolicy) {
    const parentImageRepository = findImageRepository(
      resource,
      allImageRepositories,
    );
    const parentKustomization = treeBuilder?.findParentKustomization(resource);

    return (
      <ImagePolicyDetails
        imagePolicy={resource}
        parentImageRepository={parentImageRepository}
        parentKustomization={parentKustomization}
      />
    );
  }

  if (resource instanceof ImageRepository) {
    const childImagePolicies = findChildImagePolicies(
      resource,
      allImagePolicies,
    );
    const parentKustomization = treeBuilder?.findParentKustomization(resource);

    return (
      <ImageRepositoryDetails
        imageRepository={resource}
        childImagePolicies={childImagePolicies}
        parentKustomization={parentKustomization}
      />
    );
  }

  if (resource instanceof ImageUpdateAutomation) {
    const sourceGitRepository = findSourceGitRepository(
      resource,
      allGitRepositories,
    );
    const parentKustomization = treeBuilder?.findParentKustomization(resource);

    return (
      <ImageUpdateAutomationDetails
        imageUpdateAutomation={resource}
        sourceGitRepository={sourceGitRepository}
        parentKustomization={parentKustomization}
      />
    );
  }

  return null;
};
