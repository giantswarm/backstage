/**
 * Parse a Kubernetes resource quantity that is expected to be a whole number —
 * extended resources such as `nvidia.com/gpu` (device-plugin counts) and the
 * integer node labels gpu-feature-discovery writes (`nvidia.com/gpu.count`,
 * `nvidia.com/gpu.memory` in MiB).
 *
 * Deliberately not a general quantity parser: fractional or suffixed values
 * (`500m`, `2Gi`) are not meaningful for these resources, and rendering them
 * as a count would be wrong, so they parse to `undefined` — "not known" —
 * rather than to a guess.
 */
export function parseIntegerQuantity(
  value: string | number | undefined | null,
): number | undefined {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value >= 0 ? value : undefined;
  }
  if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) {
    return undefined;
  }
  return Number.parseInt(value.trim(), 10);
}

/**
 * Sum of `resourceName` across a list of `resources` blocks, preferring
 * `requests` and falling back to `limits` per block (the scheduler treats a
 * limit-only extended resource as an equal request). `undefined` when no block
 * declares the resource at all — distinct from a declared zero.
 */
export function sumResourceRequests(
  resources: ReadonlyArray<
    | {
        requests?: Record<string, string | number>;
        limits?: Record<string, string | number>;
      }
    | undefined
  >,
  resourceName: string,
): number | undefined {
  let total: number | undefined;
  for (const block of resources) {
    const declared =
      parseIntegerQuantity(block?.requests?.[resourceName]) ??
      parseIntegerQuantity(block?.limits?.[resourceName]);
    if (declared !== undefined) {
      total = (total ?? 0) + declared;
    }
  }
  return total;
}
