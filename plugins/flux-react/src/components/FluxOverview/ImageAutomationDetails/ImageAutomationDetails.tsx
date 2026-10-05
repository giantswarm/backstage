import {
  GitRepository,
  ImagePolicy,
  ImageRepository,
  ImageUpdateAutomation,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { Flex } from '@backstage/ui';
import { ResourceCard } from '../ResourceCard';
import { Section } from '../../UI';
import {
  InventoryOwner,
  KustomizationTreeBuilder,
} from '../utils/KustomizationTreeBuilder';
import { ParentSection } from '../ParentSection';

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

  const { name, namespace } = sourceRef;

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
  parent?: InventoryOwner | null;
  allGitRepositories: GitRepository[];
};

const ImagePolicyDetails = ({
  imagePolicy,
  parentImageRepository,
  parent,
  allGitRepositories,
}: ImagePolicyDetailsProps) => {
  return (
    <Flex direction="column" gap="8">
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

      <ParentSection
        parent={parent}
        allGitRepositories={allGitRepositories}
        allOCIRepositories={[]}
      />

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
    </Flex>
  );
};

type ImageRepositoryDetailsProps = {
  imageRepository: ImageRepository;
  childImagePolicies: ImagePolicy[];
  parent?: InventoryOwner | null;
  allGitRepositories: GitRepository[];
};

const ImageRepositoryDetails = ({
  imageRepository,
  childImagePolicies,
  parent,
  allGitRepositories,
}: ImageRepositoryDetailsProps) => {
  return (
    <Flex direction="column" gap="8">
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

      <ParentSection
        parent={parent}
        allGitRepositories={allGitRepositories}
        allOCIRepositories={[]}
      />

      {childImagePolicies.length > 0 ? (
        <Section heading="ImagePolicies">
          <Flex direction="column" gap="4">
            {childImagePolicies.map(policy => (
              <ResourceCard
                key={`${policy.cluster}-${policy.getKind()}-${policy.getNamespace()}-${policy.getName()}`}
                cluster={policy.cluster}
                kind={policy.getKind()}
                name={policy.getName()}
                namespace={policy.getNamespace()}
                resource={policy}
              />
            ))}
          </Flex>
        </Section>
      ) : null}
    </Flex>
  );
};

type ImageUpdateAutomationDetailsProps = {
  imageUpdateAutomation: ImageUpdateAutomation;
  sourceGitRepository?: GitRepository;
  parent?: InventoryOwner | null;
  allGitRepositories: GitRepository[];
};

const ImageUpdateAutomationDetails = ({
  imageUpdateAutomation,
  sourceGitRepository,
  parent,
  allGitRepositories,
}: ImageUpdateAutomationDetailsProps) => {
  return (
    <Flex direction="column" gap="8">
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

      <ParentSection
        parent={parent}
        allGitRepositories={allGitRepositories}
        allOCIRepositories={[]}
      />

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
    </Flex>
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
    const parent = treeBuilder?.findParent(resource);

    return (
      <ImagePolicyDetails
        imagePolicy={resource}
        parentImageRepository={parentImageRepository}
        parent={parent}
        allGitRepositories={allGitRepositories}
      />
    );
  }

  if (resource instanceof ImageRepository) {
    const childImagePolicies = findChildImagePolicies(
      resource,
      allImagePolicies,
    );
    const parent = treeBuilder?.findParent(resource);

    return (
      <ImageRepositoryDetails
        imageRepository={resource}
        childImagePolicies={childImagePolicies}
        parent={parent}
        allGitRepositories={allGitRepositories}
      />
    );
  }

  if (resource instanceof ImageUpdateAutomation) {
    const sourceGitRepository = findSourceGitRepository(
      resource,
      allGitRepositories,
    );
    const parent = treeBuilder?.findParent(resource);

    return (
      <ImageUpdateAutomationDetails
        imageUpdateAutomation={resource}
        sourceGitRepository={sourceGitRepository}
        parent={parent}
        allGitRepositories={allGitRepositories}
      />
    );
  }

  return null;
};
