import {
  GitRepository,
  HelmRelease,
  HelmRepository,
  ImagePolicy,
  ImageRepository,
  ImageUpdateAutomation,
  Kustomization,
  OCIRepository,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  ObjectMetadata,
  parseInventoryEntries,
} from '../../../../utils/inventoryParser';
import { findTargetClusterName } from '../../../../utils/findTargetClusterName';

const COMPACT_GROUP = 'toolkit.fluxcd.io';

export type KustomizationTreeNodeData = {
  label: string;
  kind: string;
  name: string;
  namespace?: string;
  cluster: string;
  targetCluster?: string;
  resource?:
    | Kustomization
    | HelmRelease
    | GitRepository
    | OCIRepository
    | HelmRepository
    | ImagePolicy
    | ImageRepository
    | ImageUpdateAutomation;
  hasChildren: boolean;
  hasChildrenInCompactView: boolean;
};

export type KustomizationTreeNode = {
  id: string;
  nodeData: KustomizationTreeNodeData;
  children: KustomizationTreeNode[];
  displayInCompactView: boolean;
};

export class KustomizationTreeBuilder {
  private kustomizations: Map<string, Kustomization> = new Map();
  private helmReleases: Map<string, HelmRelease> = new Map();
  private inventories: Map<string, ObjectMetadata[] | undefined> = new Map();
  private gitRepositories: Map<string, GitRepository> = new Map();
  private ociRepositories: Map<string, OCIRepository> = new Map();
  private helmRepositories: Map<string, HelmRepository> = new Map();
  private imagePolicies: Map<string, ImagePolicy> = new Map();
  private imageRepositories: Map<string, ImageRepository> = new Map();
  private imageUpdateAutomations: Map<string, ImageUpdateAutomation> =
    new Map();

  constructor(
    kustomizations: Kustomization[],
    helmReleases: HelmRelease[],
    gitRepositories: GitRepository[],
    ociRepositories: OCIRepository[],
    helmRepositories: HelmRepository[],
    imagePolicies: ImagePolicy[] = [],
    imageRepositories: ImageRepository[] = [],
    imageUpdateAutomations: ImageUpdateAutomation[] = [],
  ) {
    kustomizations.forEach(k => {
      const key = this.getKey(k.getName(), k.getNamespace());

      this.kustomizations.set(key, k);

      const inventory = k.getInventory();
      const inventoryEntries = inventory
        ? parseInventoryEntries(k, inventory.entries)
        : undefined;
      this.inventories.set(key, inventoryEntries);
    });

    helmReleases.forEach(h => {
      const key = this.getKey(h.getName(), h.getNamespace());
      this.helmReleases.set(key, h);
    });

    gitRepositories.forEach(g => {
      const key = this.getKey(g.getName(), g.getNamespace());
      this.gitRepositories.set(key, g);
    });

    ociRepositories.forEach(o => {
      const key = this.getKey(o.getName(), o.getNamespace());
      this.ociRepositories.set(key, o);
    });

    helmRepositories.forEach(h => {
      const key = this.getKey(h.getName(), h.getNamespace());
      this.helmRepositories.set(key, h);
    });

    imagePolicies.forEach(p => {
      const key = this.getKey(p.getName(), p.getNamespace());
      this.imagePolicies.set(key, p);
    });

    imageRepositories.forEach(r => {
      const key = this.getKey(r.getName(), r.getNamespace());
      this.imageRepositories.set(key, r);
    });

    imageUpdateAutomations.forEach(a => {
      const key = this.getKey(a.getName(), a.getNamespace());
      this.imageUpdateAutomations.set(key, a);
    });
  }

  private getKey(name: string, namespace?: string): string {
    return namespace ? `${namespace}/${name}` : name;
  }

  private findImagePoliciesForRepository(
    imageRepository: ImageRepository,
  ): ImagePolicy[] {
    const repoName = imageRepository.getName();
    const repoNamespace = imageRepository.getNamespace();
    const repoCluster = imageRepository.cluster;

    return Array.from(this.imagePolicies.values()).filter(policy => {
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

  private findRoots(): Kustomization[] {
    // Find kustomizations that are not listed in other kustomizations inventory
    const kustomizationInventoryEntries = Array.from(
      this.inventories.values(),
    ).flatMap(inventoryEntries => {
      if (!inventoryEntries) {
        return [];
      }

      return inventoryEntries.filter(e => e.kind === 'Kustomization');
    });

    return Array.from(this.kustomizations.values()).filter(
      k =>
        !Boolean(
          kustomizationInventoryEntries.find(e => e.name === k.getName()),
        ),
    );
  }

  private findChildren(parentKey: string): ObjectMetadata[] {
    const inventoryEntries = this.inventories.get(parentKey);
    if (!inventoryEntries) {
      return [];
    }
    return inventoryEntries;
  }

  private sortChildResources(
    childResources: ObjectMetadata[],
  ): ObjectMetadata[] {
    return childResources.sort((a, b) => {
      // 1. Flux resources go first (resources that end with toolkit.fluxcd.io)
      const aIsFlux = a.group.endsWith(COMPACT_GROUP);
      const bIsFlux = b.group.endsWith(COMPACT_GROUP);

      if (aIsFlux && !bIsFlux) return -1;
      if (!aIsFlux && bIsFlux) return 1;

      // 2. Alphabetical by kind, but Kustomizations go first within each group
      const aIsKustomization = a.kind === 'Kustomization';
      const bIsKustomization = b.kind === 'Kustomization';

      if (aIsKustomization && !bIsKustomization) return -1;
      if (!aIsKustomization && bIsKustomization) return 1;

      // If both are Kustomizations or both are not, sort alphabetically by kind
      const kindComparison = a.kind.localeCompare(b.kind);
      if (kindComparison !== 0) return kindComparison;

      // 3. Alphabetical by namespace
      const aNamespace = a.namespace || '';
      const bNamespace = b.namespace || '';
      const namespaceComparison = aNamespace.localeCompare(bNamespace);
      if (namespaceComparison !== 0) return namespaceComparison;

      // 4. Alphabetical by name
      return a.name.localeCompare(b.name);
    });
  }

  private sortRootKustomizations(
    kustomizations: Kustomization[],
  ): Kustomization[] {
    return kustomizations.sort((a, b) => {
      // 1. Alphabetical by namespace
      const aNamespace = a.getNamespace() || '';
      const bNamespace = b.getNamespace() || '';
      const namespaceComparison = aNamespace.localeCompare(bNamespace);
      if (namespaceComparison !== 0) return namespaceComparison;

      // 2. Alphabetical by name
      return a.getName().localeCompare(b.getName());
    });
  }

  private buildSubtree(
    kustomization: Kustomization,
    visited: Set<string>,
  ): KustomizationTreeNode {
    const key = this.getKey(
      kustomization.getName(),
      kustomization.getNamespace(),
    );
    if (visited.has(key)) {
      // Circular dependency detected - return node without children
      // eslint-disable-next-line no-console
      console.warn(`Circular dependency detected for: ${key}`);

      const targetCluster = findTargetClusterName(kustomization);

      return {
        id: `${kustomization.cluster}-kustomization-${kustomization.getNamespace()}-${kustomization.getName()}`,
        nodeData: {
          label: kustomization.getName(),
          kind: kustomization.getKind(),
          name: kustomization.getName(),
          namespace: kustomization.getNamespace(),
          cluster: kustomization.cluster,
          targetCluster,
          resource: kustomization,
          hasChildren: false,
          hasChildrenInCompactView: false,
        },
        children: [],
        displayInCompactView: true,
      };
    }

    visited.add(key);

    // Find children - kustomizations that depend on this one
    const childResources = this.sortChildResources(this.findChildren(key));

    // Filter out ImagePolicies that have a parent ImageRepository in the same inventory
    // (they will be shown as children of the ImageRepository instead)
    const filteredChildResources = childResources.filter(child => {
      if (child.kind !== ImagePolicy.kind) {
        return true;
      }

      const childKey = this.getKey(child.name, child.namespace);
      const imagePolicy = this.imagePolicies.get(childKey);
      if (!imagePolicy) {
        return true;
      }

      const ref = imagePolicy.getImageRepositoryRef();
      if (!ref) {
        return true;
      }

      // Check if the referenced ImageRepository is in the same inventory
      const refNamespace = ref.namespace ?? imagePolicy.getNamespace();
      const hasParentInInventory = childResources.some(
        r =>
          r.kind === ImageRepository.kind &&
          r.name === ref.name &&
          r.namespace === refNamespace,
      );

      // Filter out if parent ImageRepository is in inventory
      return !hasParentInInventory;
    });

    const children: KustomizationTreeNode[] = filteredChildResources.map(
      child => {
        if (child.kind === Kustomization.kind) {
          const childKustomizationKey = this.getKey(
            child.name,
            child.namespace,
          );
          const childKustomization = this.kustomizations.get(
            childKustomizationKey,
          );
          if (childKustomization) {
            return this.buildSubtree(childKustomization, new Set(visited));
          }
        }

        let childResource:
          | HelmRelease
          | HelmRepository
          | GitRepository
          | OCIRepository
          | ImagePolicy
          | ImageRepository
          | ImageUpdateAutomation
          | undefined;
        const childKey = this.getKey(child.name, child.namespace);
        if (child.kind === HelmRelease.kind) {
          childResource = this.helmReleases.get(childKey);
        }
        if (child.kind === HelmRepository.kind) {
          childResource = this.helmRepositories.get(childKey);
        }
        if (child.kind === GitRepository.kind) {
          childResource = this.gitRepositories.get(childKey);
        }
        if (child.kind === OCIRepository.kind) {
          childResource = this.ociRepositories.get(childKey);
        }
        if (child.kind === ImagePolicy.kind) {
          childResource = this.imagePolicies.get(childKey);
        }
        if (child.kind === ImageRepository.kind) {
          childResource = this.imageRepositories.get(childKey);
        }
        if (child.kind === ImageUpdateAutomation.kind) {
          childResource = this.imageUpdateAutomations.get(childKey);
        }

        const targetCluster =
          childResource instanceof HelmRelease
            ? findTargetClusterName(childResource)
            : undefined;

        // For ImageRepository, find child ImagePolicies
        let imageRepositoryChildren: KustomizationTreeNode[] = [];
        if (childResource instanceof ImageRepository) {
          const childPolicies =
            this.findImagePoliciesForRepository(childResource);
          imageRepositoryChildren = childPolicies.map(policy => ({
            id: `${kustomization.cluster}-${ImagePolicy.kind}-${policy.getNamespace()}-${policy.getName()}`,
            nodeData: {
              label: policy.getName(),
              kind: policy.getKind(),
              name: policy.getName(),
              namespace: policy.getNamespace(),
              cluster: policy.cluster,
              resource: policy,
              hasChildren: false,
              hasChildrenInCompactView: false,
            },
            children: [],
            displayInCompactView: true,
          }));
        }

        return {
          id: `${kustomization.cluster}-${child.kind}-${child.namespace}-${child.name}`,
          nodeData: {
            ...child,
            label: child.name,
            cluster: kustomization.cluster,
            resource: childResource,
            targetCluster,
            hasChildren: imageRepositoryChildren.length > 0,
            hasChildrenInCompactView: imageRepositoryChildren.length > 0,
          },
          children: imageRepositoryChildren,
          displayInCompactView: child.group.endsWith(COMPACT_GROUP),
        };
      },
    );

    visited.delete(key);

    const targetCluster = findTargetClusterName(kustomization);

    return {
      id: `${kustomization.cluster}-kustomization-${kustomization.getNamespace()}-${kustomization.getName()}`,
      nodeData: {
        label: kustomization.getName(),
        kind: kustomization.getKind(),
        name: kustomization.getName(),
        namespace: kustomization.getNamespace(),
        cluster: kustomization.cluster,
        targetCluster,
        resource: kustomization,
        hasChildren: children.length > 0,
        hasChildrenInCompactView: children.some(r => r.displayInCompactView),
      },
      children,
      displayInCompactView: true,
    };
  }

  buildTree(): KustomizationTreeNode[] {
    const roots = this.sortRootKustomizations(this.findRoots());
    return roots.map(root => this.buildSubtree(root, new Set()));
  }

  findParentKustomization(
    resource:
      | Kustomization
      | HelmRelease
      | ImageRepository
      | ImagePolicy
      | ImageUpdateAutomation,
  ): Kustomization | null {
    for (const [key, inventoryEntries] of this.inventories.entries()) {
      const matchingInventoryEntry = inventoryEntries?.find(
        entry =>
          entry.kind === resource.getKind() &&
          entry.name === resource.getName() &&
          entry.namespace === resource.getNamespace(),
      );
      if (matchingInventoryEntry) {
        const matchingKustomization = this.kustomizations.get(key);
        return matchingKustomization ?? null;
      }
    }

    return null;
  }
}
