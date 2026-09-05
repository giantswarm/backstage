/**
 * Karpenter accepts the literal `Never` wherever a duration disables a
 * behaviour, alongside Go duration strings.
 */
const NEVER = 'Never';

const GO_DURATION_UNIT_SECONDS: Record<string, number> = {
  ns: 1e-9,
  us: 1e-6,
  µs: 1e-6,
  ms: 1e-3,
  s: 1,
  m: 60,
  h: 3600,
};

function parseGoDurationSeconds(value: string): number | undefined {
  const matches = value.matchAll(/(\d+(?:\.\d+)?)(ns|us|µs|ms|s|m|h)/g);

  let total = 0;
  let matchedLength = 0;

  for (const match of matches) {
    total += parseFloat(match[1]) * GO_DURATION_UNIT_SECONDS[match[2]];
    matchedLength += match[0].length;
  }

  // Reject partially-parsed input (e.g. `12x`) rather than silently reporting a
  // duration that ignores part of what was configured.
  return matchedLength === value.length && matchedLength > 0
    ? total
    : undefined;
}

/**
 * Render a Go duration compactly, using at most the two largest non-zero units.
 * Unparseable input is passed through so an unexpected value is still visible.
 */
export function formatGoDuration(
  value: string | undefined,
): string | undefined {
  if (value === undefined || value === '') {
    return undefined;
  }
  if (value === NEVER) {
    return NEVER;
  }

  const seconds = parseGoDurationSeconds(value);
  if (seconds === undefined) {
    return value;
  }
  if (seconds === 0) {
    return '0s';
  }
  if (seconds < 1) {
    return value;
  }

  const parts: string[] = [];
  let remaining = Math.floor(seconds);

  for (const [unit, unitSeconds] of [
    ['d', 86400],
    ['h', 3600],
    ['m', 60],
    ['s', 1],
  ] as const) {
    const count = Math.floor(remaining / unitSeconds);
    if (count > 0) {
      parts.push(`${count}${unit}`);
      remaining -= count * unitSeconds;
    }
  }

  return parts.slice(0, 2).join(' ');
}

/**
 * Karpenter limit values are quantities, and may be typed as either a number or
 * a string depending on how the CR was written.
 */
export function formatLimits(
  limits: Record<string, number | string> | undefined,
): Array<{ resource: string; value: string }> {
  if (!limits) {
    return [];
  }

  return Object.keys(limits)
    .sort((a, b) => a.localeCompare(b))
    .map(resource => ({ resource, value: String(limits[resource]) }));
}

export function formatCapacityType(value: string): string {
  switch (value) {
    case 'spot':
      return 'Spot';
    case 'on-demand':
      return 'On-demand';
    case 'reserved':
      return 'Reserved';
    default:
      return value;
  }
}

export function formatArchitecture(value: string): string {
  switch (value) {
    case 'amd64':
      return 'amd64 (x86_64)';
    case 'arm64':
      return 'arm64 (Graviton)';
    default:
      return value;
  }
}

export function formatConsolidationPolicy(
  value: 'WhenEmpty' | 'WhenEmptyOrUnderutilized' | undefined,
): string | undefined {
  switch (value) {
    case 'WhenEmpty':
      return 'When empty';
    case 'WhenEmptyOrUnderutilized':
      return 'When empty or underutilized';
    default:
      return value;
  }
}
