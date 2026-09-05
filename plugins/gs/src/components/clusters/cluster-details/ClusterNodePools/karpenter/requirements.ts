import {
  getWellKnownKey,
  RequirementGroup,
  WELL_KNOWN_REQUIREMENT_KEYS,
} from './wellKnownKeys';

/**
 * The shape of a single `spec.nodePool.template.spec.requirements` entry.
 * Declared structurally so this module stays independent of the CR types.
 */
export type RawRequirement = {
  key: string;
  operator: string;
  values?: string[];
  minValues?: number;
};

export type RequirementOperator =
  'In' | 'NotIn' | 'Exists' | 'DoesNotExist' | 'Gt' | 'Lt';

/**
 * How a constraint restricts the key, kept separate from the operator so the
 * renderer never has to re-derive whether a constraint includes or excludes.
 */
export type RequirementPolarity =
  'allow' | 'deny' | 'require' | 'forbid' | 'min' | 'max' | 'unknown';

const OPERATOR_POLARITY: Record<RequirementOperator, RequirementPolarity> = {
  In: 'allow',
  NotIn: 'deny',
  Exists: 'require',
  DoesNotExist: 'forbid',
  Gt: 'min',
  Lt: 'max',
};

const KNOWN_OPERATORS = Object.keys(OPERATOR_POLARITY) as RequirementOperator[];

export type RequirementConstraint = {
  /** Recognised operator, or `undefined` for anything unexpected. */
  operator: RequirementOperator | undefined;
  /** The operator exactly as written, rendered when `operator` is undefined. */
  rawOperator: string;
  polarity: RequirementPolarity;
  /** Values formatted for display, in author order. */
  values: string[];
  /** Values exactly as they appear on the CR, for tooltips and copying. */
  rawValues: string[];
  minValues: number | undefined;
};

export type RequirementEntry = {
  /** The raw label key, always retained. */
  key: string;
  /** Human label, or the raw key when unrecognised. */
  label: string;
  group: RequirementGroup;
  isWellKnown: boolean;
  unit: string | undefined;
  /**
   * Every constraint on this key. Karpenter *intersects* them, so these are
   * conjunctions and must not be rendered as alternatives.
   */
  constraints: RequirementConstraint[];
};

function toOperator(raw: string): RequirementOperator | undefined {
  return KNOWN_OPERATORS.find(operator => operator === raw);
}

/**
 * Group requirements by key, preserving unrecognised keys and operators.
 *
 * Well-known keys come first in registry order, then unrecognised keys
 * alphabetically, so the readout is stable regardless of CR field order.
 */
export function parseRequirements(
  requirements: RawRequirement[] | undefined,
): RequirementEntry[] {
  if (!requirements?.length) {
    return [];
  }

  const entries = new Map<string, RequirementEntry>();

  for (const requirement of requirements) {
    const wellKnown = getWellKnownKey(requirement.key);
    const operator = toOperator(requirement.operator);
    const rawValues = requirement.values ?? [];

    const constraint: RequirementConstraint = {
      operator,
      rawOperator: requirement.operator,
      polarity: operator ? OPERATOR_POLARITY[operator] : 'unknown',
      values: wellKnown?.formatValue
        ? rawValues.map(wellKnown.formatValue)
        : rawValues,
      rawValues,
      minValues: requirement.minValues,
    };

    const existing = entries.get(requirement.key);
    if (existing) {
      existing.constraints.push(constraint);
      continue;
    }

    entries.set(requirement.key, {
      key: requirement.key,
      label: wellKnown?.label ?? requirement.key,
      group: wellKnown?.group ?? 'other',
      isWellKnown: Boolean(wellKnown),
      unit: wellKnown?.unit,
      constraints: [constraint],
    });
  }

  return Array.from(entries.values()).sort((a, b) => {
    const orderA = WELL_KNOWN_REQUIREMENT_KEYS[a.key]?.order;
    const orderB = WELL_KNOWN_REQUIREMENT_KEYS[b.key]?.order;

    if (orderA !== undefined && orderB !== undefined) {
      return orderA - orderB;
    }
    if (orderA !== undefined) {
      return -1;
    }
    if (orderB !== undefined) {
      return 1;
    }
    return a.key.localeCompare(b.key);
  });
}

export function findRequirementEntry(
  entries: RequirementEntry[],
  key: string,
): RequirementEntry | undefined {
  return entries.find(entry => entry.key === key);
}

export type AllowedValues = {
  /** Values permitted by `In` constraints. Empty when only exclusions apply. */
  allowed: string[];
  /** Values ruled out by `NotIn` constraints. */
  excluded: string[];
  /**
   * True when nothing narrows the key to a value set, i.e. any value goes
   * (possibly minus `excluded`).
   */
  anyValue: boolean;
};

/**
 * Summarise what a single key permits.
 *
 * Returns `undefined` when the key carries no requirement at all — the caller
 * renders that as "any", which is Karpenter's actual behaviour for an absent
 * key and is materially different from "restricted to nothing".
 */
export function getAllowedValues(
  entries: RequirementEntry[],
  key: string,
): AllowedValues | undefined {
  const entry = findRequirementEntry(entries, key);
  if (!entry) {
    return undefined;
  }

  const allowed: string[] = [];
  const excluded: string[] = [];

  for (const constraint of entry.constraints) {
    if (constraint.polarity === 'allow') {
      allowed.push(...constraint.values);
    } else if (constraint.polarity === 'deny') {
      excluded.push(...constraint.values);
    }
  }

  return {
    allowed: Array.from(new Set(allowed)),
    excluded: Array.from(new Set(excluded)),
    anyValue: allowed.length === 0,
  };
}
