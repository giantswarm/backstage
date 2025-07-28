import {
  HelmRelease,
  Kustomization,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  ObjectMetadata,
  parseInventoryEntries,
} from '../../../../utils/inventoryParser';

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
    resource?: Kustomization | HelmRelease;
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

  constructor(kustomizations: Kustomization[], helmReleases: HelmRelease[]) {
    // Index kustomizations by their identifier
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

    // return Array.from(this.kustomizations.values()).filter(k =>
    //   Boolean(
    //     inventoryEntries.find(
    //       e => e.kind === k.getKind() && e.name === k.getName(),
    //     ),
    //   ),
    // );
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

      return {
        id: `kustomization-${kustomization.getName()}`,
        nodeData: {
          label: kustomization.getName(),
          kind: kustomization.getKind(),
          name: kustomization.getName(),
          namespace: kustomization.getNamespace(),
          cluster: kustomization.cluster,
          targetCluster: kustomization.getKubeConfig()
            ? 'remote-cl'
            : undefined,
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

      if (child.kind === HelmRelease.kind) {
        const childHelmReleaseKey = this.getKey(child.name, child.namespace);
        const childHelmRelease = this.helmReleases.get(childHelmReleaseKey);

        return {
          id: `helmrelease-${child.name}`,
          nodeData: {
            ...child,
            label: child.name,
            cluster: kustomization.cluster,
            resource: childHelmRelease,
          },
          children: [],
          level,
          displayInCompactView: true,
        };
      }

      return {
        id: `${child.kind}-${child.name}`,
        nodeData: {
          ...child,
          label: child.name,
          cluster: kustomization.cluster,
        },
        children: [],
        level,
        displayInCompactView: child.group.endsWith(COMPACT_GROUP),
      };
    });

    visited.delete(key);

    return {
      id: `kustomization-${kustomization.getName()}`,
      nodeData: {
        label: kustomization.getName(),
        kind: kustomization.getKind(),
        name: kustomization.getName(),
        namespace: kustomization.getNamespace(),
        cluster: kustomization.cluster,
        targetCluster: kustomization.getKubeConfig() ? 'remote-cl' : undefined,
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

  findParentKustomization(kustomization: Kustomization): Kustomization | null {
    for (const [key, inventoryEntries] of this.inventories.entries()) {
      const matchingInventoryEntry = inventoryEntries?.find(
        entry =>
          entry.kind === kustomization.getKind() &&
          entry.name === kustomization.getName() &&
          entry.namespace === kustomization.getNamespace(),
      );
      if (matchingInventoryEntry) {
        const matchingKustomization = this.kustomizations.get(key);
        return matchingKustomization ?? null;
      }
    }

    return null;
  }
}
