const BYTES_PER_GIB = 1024 * 1024 * 1024;

/**
 * Format a Karpenter limit/usage value for display.
 *
 * Values come from Prometheus as plain numbers in the resource's base unit:
 * cores for cpu, bytes for memory, plain counts for nodes and pods.
 */
export function formatResourceQuantity(
  resource: string,
  value: number,
): string {
  if (resource === 'memory' || resource.startsWith('hugepages')) {
    const gib = value / BYTES_PER_GIB;
    return gib >= 1
      ? `${gib.toFixed(gib >= 10 ? 0 : 1)} GiB`
      : `${Math.round(value / (1024 * 1024))} MiB`;
  }

  if (resource === 'ephemeral_storage' || resource === 'ephemeral-storage') {
    return `${(value / BYTES_PER_GIB).toFixed(0)} GiB`;
  }

  if (resource === 'cpu') {
    return value < 1
      ? `${Math.round(value * 1000)}m`
      : `${Number(value.toFixed(1))}`;
  }

  return String(value);
}

/** Human label for a Karpenter resource key. */
export function formatResourceName(resource: string): string {
  switch (resource) {
    case 'cpu':
      return 'CPU';
    case 'memory':
      return 'Memory';
    case 'nodes':
      return 'Nodes';
    case 'pods':
      return 'Pods';
    case 'ephemeral_storage':
      return 'Ephemeral storage';
    default:
      return resource;
  }
}
