import {
  GitRepository,
  HelmRelease,
  HelmRepository,
  Kustomization,
  OCIRepository,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  ObjectMetadata,
  parseInventoryEntries,
} from '../../../../utils/inventoryParser';
import { findTargetClusterName } from '../../../../utils/findTargetClusterName';

const COMPACT_GROUP = 'toolkit.fluxcd.io';

export interface KustomizationTreeNode {
  id: string;
  nodeData: {
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
      | HelmRepository;
    inventoryEntries?: ObjectMetadata[];
  };
  children: KustomizationTreeNode[];
  level: number;
  displayInCompactView: boolean;
}

export class KustomizationTreeBuilder {
  private kustomizations: Map<string, Kustomization> = new Map();
  private helmReleases: Map<string, HelmRelease> = new Map();
  private inventories: Map<string, ObjectMetadata[] | undefined> = new Map();
  private gitRepositories: Map<string, GitRepository> = new Map();
  private ociRepositories: Map<string, OCIRepository> = new Map();
  private helmRepositories: Map<string, HelmRepository> = new Map();

  constructor(
    kustomizations: Kustomization[],
    helmReleases: HelmRelease[],
    gitRepositories: GitRepository[],
    ociRepositories: OCIRepository[],
    helmRepositories: HelmRepository[],
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
  }

  private getKey(name: string, namespace?: string): string {
    return namespace ? `${namespace}/${name}` : name;
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

  private buildSubtree(
    kustomization: Kustomization,
    level: number,
    visited: Set<string>,
  ): KustomizationTreeNode {
    const key = this.getKey(
      kustomization.getName(),
      kustomization.getNamespace(),
    );
    const inventoryEntries = this.inventories.get(key);

    if (visited.has(key)) {
      // Circular dependency detected - return node without children
      console.warn(`Circular dependency detected for: ${key}`);

      const targetCluster = findTargetClusterName(kustomization);

      return {
        id: `kustomization-${kustomization.getName()}`,
        nodeData: {
          label: kustomization.getName(),
          kind: kustomization.getKind(),
          name: kustomization.getName(),
          namespace: kustomization.getNamespace(),
          cluster: kustomization.cluster,
          targetCluster,
          resource: kustomization,
          inventoryEntries,
        },
        children: [],
        level,
        displayInCompactView: true,
      };
    }

    visited.add(key);

    // Find children - kustomizations that depend on this one
    const childResources = this.findChildren(key);
    const children: KustomizationTreeNode[] = childResources.map(child => {
      if (child.kind === Kustomization.kind) {
        const childKustomizationKey = this.getKey(child.name, child.namespace);
        const childKustomization = this.kustomizations.get(
          childKustomizationKey,
        );
        if (childKustomization) {
          return this.buildSubtree(
            childKustomization,
            level + 1,
            new Set(visited),
          );
        }
      }

      let childResource:
        | HelmRelease
        | HelmRepository
        | GitRepository
        | OCIRepository
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

      const targetCluster =
        childResource instanceof HelmRelease
          ? findTargetClusterName(childResource)
          : undefined;

      return {
        id: `${child.kind}-${child.name}`,
        nodeData: {
          ...child,
          label: child.name,
          cluster: kustomization.cluster,
          resource: childResource,
          targetCluster,
        },
        children: [],
        level,
        displayInCompactView: child.group.endsWith(COMPACT_GROUP),
      };
    });

    visited.delete(key);

    const targetCluster = findTargetClusterName(kustomization);

    return {
      id: `kustomization-${kustomization.getName()}`,
      nodeData: {
        label: kustomization.getName(),
        kind: kustomization.getKind(),
        name: kustomization.getName(),
        namespace: kustomization.getNamespace(),
        cluster: kustomization.cluster,
        targetCluster,
        resource: kustomization,
        inventoryEntries,
      },
      children,
      level,
      displayInCompactView: true,
    };
  }

  buildTree(): KustomizationTreeNode[] {
    const roots = this.findRoots();
    return roots.map(root => this.buildSubtree(root, 0, new Set()));
  }

  findParentKustomization(
    resource: Kustomization | HelmRelease,
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
