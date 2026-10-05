import {
  FluxInstance,
  HelmRelease,
  ImagePolicy,
  ImageRepository,
  Kustomization,
  ResourceSet,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  ObjectMetadata,
  parseInventoryEntries,
} from '../../../../utils/inventoryParser';
import { findTargetClusterName } from '../../../../utils/findTargetClusterName';
import {
  FluxResource,
  FluxResourceCollections,
} from '../../../../utils/fluxResources';

/**
 * Whether objects of `group` are Flux objects, which the tree's compact
 * ("Flux") view keeps: the toolkit kinds and the Flux Operator kinds.
 */
export function isFluxGroup(group: string): boolean {
  return group.endsWith('toolkit.fluxcd.io') || group === FluxInstance.group;
}

/**
 * A Flux object that applies other objects and lists them in its
 * `status.inventory`, and so has children in the tree.
 */
export type InventoryOwner = Kustomization | ResourceSet | FluxInstance;

export function isInventoryOwner(
  resource: FluxResource | undefined,
): resource is InventoryOwner {
  return (
    resource instanceof Kustomization ||
    resource instanceof ResourceSet ||
    resource instanceof FluxInstance
  );
}

/**
 * The order in which owners that nothing else applies become roots, and in
 * which a cycle of owners is broken: a FluxInstance installs Flux and creates
 * the Kustomization that may in turn apply the FluxInstance from Git.
 */
const ROOT_KIND_ORDER: string[] = [
  FluxInstance.kind,
  Kustomization.kind,
  ResourceSet.kind,
];

export type KustomizationTreeNodeData = {
  label: string;
  kind: string;
  name: string;
  namespace?: string;
  cluster: string;
  targetCluster?: string;
  resource?: FluxResource;
  hasChildren: boolean;
  hasChildrenInCompactView: boolean;
  isFailing: boolean;
  hasFailingDescendants: boolean;
};

function isResourceFailing(
  resource?: KustomizationTreeNodeData['resource'],
): boolean {
  if (resource?.isSuspended()) {
    // A suspended resource keeps its last Ready condition frozen, so a
    // resource that was failing when it got suspended would otherwise still
    // count as failing. Suspended resources are rendered as inactive, not
    // failing (consistent with getAggregatedStatus).
    return false;
  }

  return resource?.findReadyCondition()?.status === 'False';
}

export type KustomizationTreeNode = {
  id: string;
  nodeData: KustomizationTreeNodeData;
  children: KustomizationTreeNode[];
  displayInCompactView: boolean;
};

function getObjectKey({ group, kind, namespace, name }: ObjectMetadata) {
  return `${group}/${kind}/${namespace}/${name}`;
}

function getResourceKey(resource: FluxResource) {
  return getObjectKey({
    group: resource.getGroup() ?? '',
    kind: resource.getKind(),
    namespace: resource.getNamespace() ?? '',
    name: resource.getName(),
  });
}

export class KustomizationTreeBuilder {
  /** Every resource, by group, kind, namespace and name. */
  private resources: Map<string, FluxResource> = new Map();
  private owners: Map<string, InventoryOwner> = new Map();
  private inventories: Map<string, ObjectMetadata[] | undefined> = new Map();
  private imagePolicies: ImagePolicy[];

  constructor(resources: Partial<FluxResourceCollections>) {
    const allResources = Object.values(resources).flat() as FluxResource[];

    for (const resource of allResources) {
      const key = getResourceKey(resource);
      this.resources.set(key, resource);

      if (isInventoryOwner(resource)) {
        this.owners.set(key, resource);

        const inventory = resource.getInventory();
        this.inventories.set(
          key,
          inventory
            ? parseInventoryEntries(resource, inventory.entries)
            : undefined,
        );
      }
    }

    this.imagePolicies = resources.imagePolicies ?? [];
  }

  private findImagePoliciesForRepository(
    imageRepository: ImageRepository,
  ): ImagePolicy[] {
    const repoName = imageRepository.getName();
    const repoNamespace = imageRepository.getNamespace();
    const repoCluster = imageRepository.cluster;

    return this.imagePolicies.filter(policy => {
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

  private findChildOwnerKeys(ownerKey: string): string[] {
    return (this.inventories.get(ownerKey) ?? [])
      .map(getObjectKey)
      .filter(key => this.owners.has(key));
  }

  /**
   * Owners that no other owner lists in its inventory, plus one owner of every
   * cycle that nothing else reaches. References are matched by group, kind,
   * namespace and name — name-only matching would let any inventory entry
   * disqualify unrelated owners that share its name in other namespaces, which
   * can collapse the whole tree to zero roots on multi-org clusters. (An
   * owner's own self-reference — the self-managed bootstrap pattern — is
   * already stripped at parse time by parseInventoryEntries.)
   */
  private findRoots(): InventoryOwner[] {
    const referencedKeys = new Set(
      Array.from(this.owners.keys()).flatMap(key =>
        this.findChildOwnerKeys(key),
      ),
    );

    const roots = this.sortRoots(
      Array.from(this.owners.entries())
        .filter(([key]) => !referencedKeys.has(key))
        .map(([, owner]) => owner),
    );

    const reached = new Set<string>();
    const reach = (key: string) => {
      if (reached.has(key)) {
        return;
      }
      reached.add(key);
      this.findChildOwnerKeys(key).forEach(reach);
    };
    roots.forEach(root => reach(getResourceKey(root)));

    for (const owner of this.sortRoots(Array.from(this.owners.values()))) {
      const key = getResourceKey(owner);
      if (!reached.has(key)) {
        roots.push(owner);
        reach(key);
      }
    }

    return this.sortRoots(roots);
  }

  private sortChildResources(
    childResources: ObjectMetadata[],
  ): ObjectMetadata[] {
    return childResources.sort((a, b) => {
      // 1. Flux resources go first
      const aIsFlux = isFluxGroup(a.group);
      const bIsFlux = isFluxGroup(b.group);

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

  private sortRoots(owners: InventoryOwner[]): InventoryOwner[] {
    return owners.sort((a, b) => {
      // 1. By kind: FluxInstances, then Kustomizations, then ResourceSets
      const kindComparison =
        ROOT_KIND_ORDER.indexOf(a.getKind()) -
        ROOT_KIND_ORDER.indexOf(b.getKind());
      if (kindComparison !== 0) return kindComparison;

      // 2. Alphabetical by namespace
      const aNamespace = a.getNamespace() || '';
      const bNamespace = b.getNamespace() || '';
      const namespaceComparison = aNamespace.localeCompare(bNamespace);
      if (namespaceComparison !== 0) return namespaceComparison;

      // 3. Alphabetical by name
      return a.getName().localeCompare(b.getName());
    });
  }

  private getOwnerNodeId(owner: InventoryOwner) {
    return `${owner.cluster}-${owner.getKind().toLowerCase()}-${owner.getNamespace()}-${owner.getName()}`;
  }

  private buildSubtree(
    owner: InventoryOwner,
    visited: Set<string>,
  ): KustomizationTreeNode {
    const key = getResourceKey(owner);
    const targetCluster =
      owner instanceof Kustomization ? findTargetClusterName(owner) : undefined;

    if (visited.has(key)) {
      // Circular dependency detected - return node without children
      // eslint-disable-next-line no-console
      console.warn(`Circular dependency detected for: ${key}`);

      return {
        id: this.getOwnerNodeId(owner),
        nodeData: {
          label: owner.getName(),
          kind: owner.getKind(),
          name: owner.getName(),
          namespace: owner.getNamespace(),
          cluster: owner.cluster,
          targetCluster,
          resource: owner,
          hasChildren: false,
          hasChildrenInCompactView: false,
          isFailing: isResourceFailing(owner),
          hasFailingDescendants: false,
        },
        children: [],
        displayInCompactView: true,
      };
    }

    visited.add(key);

    const childResources = this.sortChildResources([
      ...(this.inventories.get(key) ?? []),
    ]);

    // Filter out ImagePolicies that have a parent ImageRepository in the same inventory
    // (they will be shown as children of the ImageRepository instead)
    const filteredChildResources = childResources.filter(child => {
      if (child.kind !== ImagePolicy.kind) {
        return true;
      }

      const imagePolicy = this.resources.get(getObjectKey(child));
      if (!(imagePolicy instanceof ImagePolicy)) {
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
        const childKey = getObjectKey(child);

        const childOwner = this.owners.get(childKey);
        if (childOwner) {
          return this.buildSubtree(childOwner, new Set(visited));
        }

        const childResource = this.resources.get(childKey);

        const childTargetCluster =
          childResource instanceof HelmRelease
            ? findTargetClusterName(childResource)
            : undefined;

        // For ImageRepository, find child ImagePolicies
        let imageRepositoryChildren: KustomizationTreeNode[] = [];
        if (childResource instanceof ImageRepository) {
          const childPolicies =
            this.findImagePoliciesForRepository(childResource);
          imageRepositoryChildren = childPolicies.map(policy => ({
            id: `${owner.cluster}-${ImagePolicy.kind}-${policy.getNamespace()}-${policy.getName()}`,
            nodeData: {
              label: policy.getName(),
              kind: policy.getKind(),
              name: policy.getName(),
              namespace: policy.getNamespace(),
              cluster: policy.cluster,
              resource: policy,
              hasChildren: false,
              hasChildrenInCompactView: false,
              isFailing: isResourceFailing(policy),
              hasFailingDescendants: false,
            },
            children: [],
            displayInCompactView: true,
          }));
        }

        return {
          id: `${owner.cluster}-${child.kind}-${child.namespace}-${child.name}`,
          nodeData: {
            ...child,
            label: child.name,
            cluster: owner.cluster,
            resource: childResource,
            targetCluster: childTargetCluster,
            hasChildren: imageRepositoryChildren.length > 0,
            hasChildrenInCompactView: imageRepositoryChildren.length > 0,
            isFailing: isResourceFailing(childResource),
            hasFailingDescendants: imageRepositoryChildren.some(
              r => r.nodeData.isFailing || r.nodeData.hasFailingDescendants,
            ),
          },
          children: imageRepositoryChildren,
          displayInCompactView: isFluxGroup(child.group),
        };
      },
    );

    visited.delete(key);

    return {
      id: this.getOwnerNodeId(owner),
      nodeData: {
        label: owner.getName(),
        kind: owner.getKind(),
        name: owner.getName(),
        namespace: owner.getNamespace(),
        cluster: owner.cluster,
        targetCluster,
        resource: owner,
        hasChildren: children.length > 0,
        hasChildrenInCompactView: children.some(r => r.displayInCompactView),
        isFailing: isResourceFailing(owner),
        hasFailingDescendants: children.some(
          r => r.nodeData.isFailing || r.nodeData.hasFailingDescendants,
        ),
      },
      children,
      displayInCompactView: true,
    };
  }

  buildTree(): KustomizationTreeNode[] {
    return this.findRoots().map(root => this.buildSubtree(root, new Set()));
  }

  /**
   * The owner whose inventory lists `resource`, if any.
   */
  findParent(resource: FluxResource): InventoryOwner | null {
    const resourceKey = getResourceKey(resource);

    for (const [key, inventoryEntries] of this.inventories.entries()) {
      if (
        inventoryEntries?.some(entry => getObjectKey(entry) === resourceKey)
      ) {
        return this.owners.get(key) ?? null;
      }
    }

    return null;
  }

  /**
   * The resources `owner` lists in its inventory that this builder knows.
   */
  findInventoryResources(owner: InventoryOwner): FluxResource[] {
    return (this.inventories.get(getResourceKey(owner)) ?? []).flatMap(
      entry => {
        const resource = this.resources.get(getObjectKey(entry));
        return resource ? [resource] : [];
      },
    );
  }
}
