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

const QUANTITY_SUFFIXES: Record<string, number> = {
  n: 1e-9,
  u: 1e-6,
  m: 1e-3,
  '': 1,
  k: 1e3,
  M: 1e6,
  G: 1e9,
  T: 1e12,
  P: 1e15,
  E: 1e18,
  Ki: 1024,
  Mi: 1024 ** 2,
  Gi: 1024 ** 3,
  Ti: 1024 ** 4,
  Pi: 1024 ** 5,
  Ei: 1024 ** 6,
};

/**
 * A Kubernetes quantity in its base unit: `500m` → 0.5, `192Gi` and
 * `206158430208` → bytes, `1e3` → 1000. Undefined for anything else.
 */
export function parseResourceQuantity(
  value: string | number,
): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  const match = /^([+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)([a-zA-Z]*)$/.exec(
    value.trim(),
  );
  const factor = match ? QUANTITY_SUFFIXES[match[2]] : undefined;
  return match && factor !== undefined ? Number(match[1]) * factor : undefined;
}

/** `ip-10-0-41-12.eu-central-1.compute.internal` → `ip-10-0-41-12`. */
export function shortenNodeName(name: string): string {
  return name.split('.')[0];
}

/** `eu-central-1a` → `A`, `westeurope-2` → `2`, as the tables shorten a zone. */
export function shortenZone(zone: string): string {
  return zone.slice(-1).toUpperCase();
}
