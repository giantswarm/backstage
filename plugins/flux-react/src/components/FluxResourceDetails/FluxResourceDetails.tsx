import { useMemo } from 'react';
import {
  HelmRelease,
  GitRepository,
  HelmRepository,
  ImagePolicy,
  ImageRepository,
  ImageUpdateAutomation,
  Kustomization,
  OCIRepository,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { Details } from '../FluxOverview/Details';
import { KustomizationTreeBuilder } from '../FluxOverview/utils/KustomizationTreeBuilder';

export const FluxResourceDetails = ({
  cluster,
  kind,
  name,
  namespace,
  kustomizations,
  helmReleases,
  gitRepositories,
  ociRepositories,
  helmRepositories,
  imagePolicies,
  imageRepositories,
  imageUpdateAutomations,
  isLoading,
}: {
  cluster: string;
  kind: string;
  name: string;
  namespace: string;
  kustomizations: Kustomization[];
  helmReleases: HelmRelease[];
  gitRepositories: GitRepository[];
  ociRepositories: OCIRepository[];
  helmRepositories: HelmRepository[];
  imagePolicies: ImagePolicy[];
  imageRepositories: ImageRepository[];
  imageUpdateAutomations: ImageUpdateAutomation[];
  isLoading: boolean;
}) => {
  const resourceRef = useMemo(
    () => ({ cluster, kind, name, namespace }),
    [cluster, kind, name, namespace],
  );

  const selectedResource = useMemo(() => {
    if (kind === Kustomization.kind.toLowerCase()) {
      return kustomizations.find(
        k =>
          k.cluster === cluster &&
          k.getNamespace() === namespace &&
          k.getName() === name,
      );
    }

    if (kind === HelmRelease.kind.toLowerCase()) {
      return helmReleases.find(
        h =>
          h.cluster === cluster &&
          h.getNamespace() === namespace &&
          h.getName() === name,
      );
    }

    if (kind === GitRepository.kind.toLowerCase()) {
      return gitRepositories.find(
        r =>
          r.cluster === cluster &&
          r.getNamespace() === namespace &&
          r.getName() === name,
      );
    }

    if (kind === OCIRepository.kind.toLowerCase()) {
      return ociRepositories.find(
        r =>
          r.cluster === cluster &&
          r.getNamespace() === namespace &&
          r.getName() === name,
      );
    }

    if (kind === HelmRepository.kind.toLowerCase()) {
      return helmRepositories.find(
        r =>
          r.cluster === cluster &&
          r.getNamespace() === namespace &&
          r.getName() === name,
      );
    }

    if (kind === ImagePolicy.kind.toLowerCase()) {
      return imagePolicies.find(
        p =>
          p.cluster === cluster &&
          p.getNamespace() === namespace &&
          p.getName() === name,
      );
    }

    if (kind === ImageRepository.kind.toLowerCase()) {
      return imageRepositories.find(
        r =>
          r.cluster === cluster &&
          r.getNamespace() === namespace &&
          r.getName() === name,
      );
    }

    if (kind === ImageUpdateAutomation.kind.toLowerCase()) {
      return imageUpdateAutomations.find(
        a =>
          a.cluster === cluster &&
          a.getNamespace() === namespace &&
          a.getName() === name,
      );
    }

    return undefined;
  }, [
    cluster,
    kind,
    name,
    namespace,
    kustomizations,
    helmReleases,
    gitRepositories,
    ociRepositories,
    helmRepositories,
    imagePolicies,
    imageRepositories,
    imageUpdateAutomations,
  ]);

  const treeBuilder = useMemo(() => {
    const selectedKustomizations = kustomizations.filter(
      k => k.cluster === cluster,
    );
    const selectedHelmReleases = helmReleases.filter(
      h => h.cluster === cluster,
    );
    const selectedGitRepositories = gitRepositories.filter(
      g => g.cluster === cluster,
    );
    const selectedOCIRepositories = ociRepositories.filter(
      o => o.cluster === cluster,
    );
    const selectedHelmRepositories = helmRepositories.filter(
      h => h.cluster === cluster,
    );

    return new KustomizationTreeBuilder(
      selectedKustomizations,
      selectedHelmReleases,
      selectedGitRepositories,
      selectedOCIRepositories,
      selectedHelmRepositories,
    );
  }, [
    cluster,
    kustomizations,
    helmReleases,
    gitRepositories,
    ociRepositories,
    helmRepositories,
  ]);

  return (
    <Details
      resourceRef={resourceRef}
      resource={selectedResource}
      treeBuilder={treeBuilder}
      allKustomizations={kustomizations}
      allHelmReleases={helmReleases}
      allGitRepositories={gitRepositories}
      allOCIRepositories={ociRepositories}
      allHelmRepositories={helmRepositories}
      allImagePolicies={imagePolicies}
      allImageRepositories={imageRepositories}
      allImageUpdateAutomations={imageUpdateAutomations}
      isLoadingResources={isLoading}
    />
  );
};
