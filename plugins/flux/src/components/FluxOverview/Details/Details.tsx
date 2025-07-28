import { Progress } from '@backstage/core-components';
import { Kustomization } from '@giantswarm/backstage-plugin-kubernetes-react';
import { KustomizationDetails } from '../KustomizationDetails';
import { KustomizationTreeBuilder } from '../utils/KustomizationTreeBuilder';

type DetailsProps = {
  kustomizationRef: {
    cluster: string;
    namespace: string;
    name: string;
    kind: string;
  };
  kustomization?: Kustomization;
  allKustomizations: Kustomization[];
  treeBuilder: KustomizationTreeBuilder;
  isLoadingKustomizations: boolean;
};

export const Details = ({
  kustomizationRef,
  kustomization,
  allKustomizations,
  treeBuilder,
  isLoadingKustomizations,
}: DetailsProps) => {
  if (isLoadingKustomizations) {
    return <Progress />;
  }

  if (!kustomization) {
    return (
      <div>
        Kustomization {kustomizationRef.namespace}/{kustomizationRef.name} in
        cluster {kustomizationRef.cluster} not found.
      </div>
    );
  }

  return (
    <KustomizationDetails
      kustomization={kustomization}
      allKustomizations={allKustomizations}
      treeBuilder={treeBuilder}
    />
  );
};
