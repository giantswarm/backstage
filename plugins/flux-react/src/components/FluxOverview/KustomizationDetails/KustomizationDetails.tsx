import {
  GitRepository,
  Kustomization,
  OCIRepository,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { Flex } from '@backstage/ui';
import { ResourceCard } from '../ResourceCard';
import { ParentSection } from '../ParentSection';
import { KustomizationTreeBuilder } from '../utils/KustomizationTreeBuilder';
import { Section } from '../../UI';
import { findTargetClusterName } from '../../../utils/findTargetClusterName';
import { findKustomizationSource } from '../../../utils/findKustomizationSource';

type KustomizationDetailsProps = {
  kustomization: Kustomization;
  allKustomizations: Kustomization[];
  allGitRepositories: GitRepository[];
  allOCIRepositories: OCIRepository[];
  treeBuilder?: KustomizationTreeBuilder;
};

export const KustomizationDetails = ({
  kustomization,
  treeBuilder,
  allKustomizations,
  allGitRepositories,
  allOCIRepositories,
}: KustomizationDetailsProps) => {
  const source = findKustomizationSource(
    kustomization,
    allGitRepositories,
    allOCIRepositories,
  );

  const parent = treeBuilder?.findParent(kustomization);

  const dependsOn = kustomization.getDependsOn();
  const dependencies = dependsOn
    ? (dependsOn
        .map(d =>
          allKustomizations.find(
            k =>
              k.getName() === d.name &&
              k.getNamespace() ===
                (d.namespace ?? kustomization.getNamespace()),
          ),
        )
        .filter(k => Boolean(k)) as Kustomization[])
    : null;

  return (
    <Flex direction="column" gap="8">
      <Section heading="This Kustomization">
        <ResourceCard
          cluster={kustomization.cluster}
          kind={kustomization.getKind()}
          name={kustomization.getName()}
          namespace={kustomization.getNamespace()}
          targetCluster={findTargetClusterName(kustomization)}
          resource={kustomization}
          source={source}
          highlighted
        />
      </Section>

      <ParentSection
        parent={parent}
        headingPrefix="Parent "
        allGitRepositories={allGitRepositories}
        allOCIRepositories={allOCIRepositories}
      />

      {source ? (
        <Section heading="Source">
          <ResourceCard
            cluster={source.cluster}
            kind={source.getKind()}
            name={source.getName()}
            namespace={source.getNamespace()}
            resource={source}
          />
        </Section>
      ) : null}

      {dependencies ? (
        <Section heading="Dependencies">
          <Flex direction="column" gap="6">
            {dependencies.map(resource => (
              <ResourceCard
                key={`${resource.cluster}-${resource.getKind()}-${resource.getNamespace()}-${resource.getName()}`}
                cluster={resource.cluster}
                kind={resource.getKind()}
                name={resource.getName()}
                namespace={resource.getNamespace()}
                targetCluster={findTargetClusterName(resource)}
                resource={resource}
                source={findKustomizationSource(
                  resource,
                  allGitRepositories,
                  allOCIRepositories,
                )}
              />
            ))}
          </Flex>
        </Section>
      ) : null}
    </Flex>
  );
};
