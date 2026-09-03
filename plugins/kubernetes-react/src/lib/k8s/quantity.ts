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

const BINARY_SUFFIX_BYTES: Record<string, number> = {
  Ki: 2 ** 10,
  Mi: 2 ** 20,
  Gi: 2 ** 30,
  Ti: 2 ** 40,
  Pi: 2 ** 50,
  Ei: 2 ** 60,
};

const DECIMAL_SUFFIX_BYTES: Record<string, number> = {
  m: 1e-3,
  k: 1e3,
  M: 1e6,
  G: 1e9,
  T: 1e12,
  P: 1e15,
  E: 1e18,
};

/** One gibibyte, the unit memory budgets are reasoned about in. */
export const GIB = 2 ** 30;

/**
 * Parse a Kubernetes memory quantity into bytes: the binary (`64Gi`,
 * `90251888Ki`) and decimal (`500M`, `1e9`) forms the apiserver serializes
 * `status.allocatable.memory` and resource requests in. `undefined` when the
 * value is not a quantity — "not known", never a guess.
 */
export function parseMemoryQuantity(
  value: string | number | undefined | null,
): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? value : undefined;
  }
  if (typeof value !== 'string') {
    return undefined;
  }
  const match =
    /^([0-9]+(?:\.[0-9]+)?)(?:([eE][+-]?[0-9]+)|(Ki|Mi|Gi|Ti|Pi|Ei|[mkMGTPE]))?$/.exec(
      value.trim(),
    );
  if (!match) {
    return undefined;
  }
  const [, digits, exponent, suffix] = match;
  const base = Number.parseFloat(`${digits}${exponent ?? ''}`);
  const factor = suffix
    ? (BINARY_SUFFIX_BYTES[suffix] ?? DECIMAL_SUFFIX_BYTES[suffix])
    : 1;
  return base * factor;
}
