# Flux Inventory Parser

This TypeScript implementation replicates the functionality of the Go code from [fluxcd/cli-utils](https://github.com/fluxcd/cli-utils) that parses Flux kustomization inventory entries.

## Overview

The Flux CLI uses a specific format to track resources managed by Kustomizations. This format is stored in the `kustomization.status.inventory.entries` field and contains metadata about all resources that were applied by the Kustomization.

## Implementation Details

### Based on Go Code Analysis

The implementation is based on analyzing the Go code from:

- [`fluxcd/flux2/cmd/flux/tree_kustomization.go`](https://github.com/fluxcd/flux2/blob/main/cmd/flux/tree_kustomization.go)
- [`fluxcd/cli-utils/pkg/object/objmetadata.go`](https://github.com/fluxcd/cli-utils/tree/main/pkg/object/objmetadata.go)

The key parsing logic comes from the `object.ParseObjMetadata(entry.ID)` function in the Go codebase.

### Inventory Format

The inventory format follows this pattern:

```
<namespace>_<name>_<group>_<kind>
```

#### Examples:

- `flux-system_helm-controller_apps_Deployment` - Namespaced resource
- `_flux-system_v1_Namespace` - Cluster-scoped resource (empty namespace)
- `flux-system_kubeadm__nodes-kubeadm-config_rbac.authorization.k8s.io_Role` - RBAC with encoded colon

#### Special Cases:

1. **Cluster-scoped resources**: Have empty namespace, represented as `_` prefix
2. **RBAC resources with colons**: Colons (`:`) are encoded as double underscores (`__`)
3. **Field separator**: Uses underscore (`_`) to separate the four fields

## API Reference

### Types

```typescript
interface ObjectMetadata {
  namespace: string;
  name: string;
  groupKind: {
    group: string;
    kind: string;
  };
}

interface InventoryEntry {
  id: string;
  v?: string; // Version (optional)
}
```

### Core Functions

#### `parseObjectMetadata(inventoryId: string): ObjectMetadata`

Parses a single inventory ID string into structured metadata.

**Parameters:**

- `inventoryId`: Inventory ID in format `namespace_name_group_kind`

**Returns:** Parsed `ObjectMetadata` object

**Throws:** Error if parsing fails

**Example:**

```typescript
const result = parseObjectMetadata(
  'flux-system_helm-controller_apps_Deployment',
);
// Returns: {
//   namespace: 'flux-system',
//   name: 'helm-controller',
//   groupKind: { group: 'apps', kind: 'Deployment' }
// }
```

#### `parseInventoryEntries(inventoryEntries: InventoryEntry[]): ObjectMetadata[]`

Parses an array of inventory entries from a Kustomization status.

**Parameters:**

- `inventoryEntries`: Array from `kustomization.status.inventory.entries`

**Returns:** Array of parsed `ObjectMetadata` objects

**Example:**

```typescript
const entries = [
  { id: 'flux-system_helm-controller_apps_Deployment' },
  { id: '_flux-system_v1_Namespace' },
];
const result = parseInventoryEntries(entries);
```

### Utility Functions

#### `groupInventoryByKind(entries: ObjectMetadata[]): Record<string, ObjectMetadata[]>`

Groups resources by their Kubernetes kind.

#### `filterInventoryByNamespace(entries: ObjectMetadata[], namespace: string): ObjectMetadata[]`

Filters resources by namespace. Use empty string `''` for cluster-scoped resources.

#### `isClusterScoped(objMetadata: ObjectMetadata): boolean`

Checks if a resource is cluster-scoped (has empty namespace).

#### `formatObjectMetadata(objMetadata: ObjectMetadata): string`

Formats an `ObjectMetadata` object back to inventory string format.

## Usage Examples

### Basic Parsing

```typescript
import { parseInventoryEntries } from './inventoryParser';

// From a Kustomization resource
const kustomization = await fetchKustomization();
const inventory = kustomization.status?.inventory?.entries || [];
const resources = parseInventoryEntries(inventory);

console.log(`Found ${resources.length} managed resources`);
```

### Analysis and Grouping

```typescript
import {
  parseInventoryEntries,
  groupInventoryByKind,
  filterInventoryByNamespace,
  isClusterScoped,
} from './inventoryParser';

const resources = parseInventoryEntries(inventory);

// Group by kind
const byKind = groupInventoryByKind(resources);
console.log('Deployments:', byKind.Deployment?.length || 0);
console.log('Services:', byKind.Service?.length || 0);

// Filter by namespace
const fluxResources = filterInventoryByNamespace(resources, 'flux-system');
const clusterResources = resources.filter(isClusterScoped);

console.log(`Flux system resources: ${fluxResources.length}`);
console.log(`Cluster-scoped resources: ${clusterResources.length}`);
```

### Integration with React Component

```typescript
import { useKustomizations } from '../hooks/useKustomizations';
import { parseInventoryEntries, groupInventoryByKind } from '../utils/inventoryParser';

export function FluxOverview() {
  const { resources: kustomizations } = useKustomizations();

  const allResources = kustomizations?.flatMap(k => {
    if (!k.status?.inventory?.entries) return [];
    return parseInventoryEntries(k.status.inventory.entries);
  }) || [];

  const byKind = groupInventoryByKind(allResources);

  return (
    <div>
      <h2>Managed Resources: {allResources.length}</h2>
      {Object.entries(byKind).map(([kind, resources]) => (
        <div key={kind}>{kind}: {resources.length}</div>
      ))}
    </div>
  );
}
```

## Error Handling

The parser includes comprehensive error handling:

```typescript
try {
  const parsed = parseObjectMetadata(inventoryId);
  // Use parsed result
} catch (error) {
  console.error('Failed to parse inventory ID:', error.message);
  // Handle parsing error
}
```

Common parsing errors:

- Empty inventory ID
- Insufficient fields (< 4 fields)
- Too many fields (> 4 fields)
- Invalid format

## Testing

The implementation includes comprehensive tests covering:

- Basic parsing scenarios
- RBAC resources with colons
- Cluster-scoped resources
- Error conditions
- Round-trip parsing (parse → format → parse)
- Real-world inventory examples

Run tests with:

```bash
npm test inventoryParser.test.ts
```

## Comparison with Go Implementation

This TypeScript implementation maintains full compatibility with the Go version:

| Feature                  | Go Implementation | TypeScript Implementation |
| ------------------------ | ----------------- | ------------------------- |
| Basic parsing            | ✅                | ✅                        |
| RBAC colon encoding      | ✅                | ✅                        |
| Cluster-scoped resources | ✅                | ✅                        |
| Error handling           | ✅                | ✅                        |
| Field validation         | ✅                | ✅                        |
| Round-trip compatibility | ✅                | ✅                        |

## Integration Notes

### With Backstage

This parser integrates seamlessly with Backstage plugins that work with Flux resources:

```typescript
// In a Backstage plugin component
import { parseInventoryEntries } from '@internal/flux-utils';

const { entity } = useEntity();
const kustomizations = useRelatedKustomizations(entity);

const managedResources = kustomizations.flatMap(k =>
  parseInventoryEntries(k.status?.inventory?.entries || []),
);
```

### Performance Considerations

- Parsing is O(n) where n is the number of inventory entries
- Minimal memory overhead
- No external dependencies
- Suitable for real-time UI updates

### Future Extensions

The parser can be extended to support:

- Additional metadata extraction
- Resource relationship mapping
- Dependency analysis
- Status aggregation

## Related Documentation

- [Flux CD Documentation](https://fluxcd.io/docs/)
- [Kustomization CRD Specification](https://fluxcd.io/docs/components/kustomize/kustomization/)
- [CLI Utils Source Code](https://github.com/fluxcd/cli-utils)
