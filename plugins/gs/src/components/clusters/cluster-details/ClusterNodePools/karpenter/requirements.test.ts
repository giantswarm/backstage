import {
  findRequirementEntry,
  getAllowedValues,
  parseRequirements,
  RawRequirement,
} from './requirements';
import { ARCH_KEY, CAPACITY_TYPE_KEY, ZONE_KEY } from './wellKnownKeys';

describe('parseRequirements', () => {
  it('returns an empty array for undefined or empty input', () => {
    expect(parseRequirements(undefined)).toEqual([]);
    expect(parseRequirements([])).toEqual([]);
  });

  it('groups multiple requirements on the same key into one entry', () => {
    const entries = parseRequirements([
      {
        key: 'karpenter.k8s.aws/instance-generation',
        operator: 'Gt',
        values: ['2'],
      },
      {
        key: 'karpenter.k8s.aws/instance-generation',
        operator: 'Lt',
        values: ['9'],
      },
    ]);

    expect(entries).toHaveLength(1);
    expect(entries[0].constraints).toHaveLength(2);
    expect(entries[0].constraints.map(c => c.polarity)).toEqual(['min', 'max']);
  });

  it('formats values of well-known keys', () => {
    const entries = parseRequirements([
      { key: CAPACITY_TYPE_KEY, operator: 'In', values: ['spot', 'on-demand'] },
    ]);

    expect(entries[0].label).toBe('Capacity type');
    expect(entries[0].constraints[0].values).toEqual(['Spot', 'On-demand']);
    expect(entries[0].constraints[0].rawValues).toEqual(['spot', 'on-demand']);
  });

  it('keeps unrecognised keys, labelled with the raw key', () => {
    const entries = parseRequirements([
      { key: 'example.com/custom', operator: 'In', values: ['a'] },
    ]);

    expect(entries[0]).toMatchObject({
      key: 'example.com/custom',
      label: 'example.com/custom',
      group: 'other',
      isWellKnown: false,
    });
  });

  it('keeps an unrecognised operator verbatim rather than dropping it', () => {
    const entries = parseRequirements([
      { key: ARCH_KEY, operator: 'Weird', values: ['arm64'] },
    ]);

    expect(entries[0].constraints[0]).toMatchObject({
      operator: undefined,
      rawOperator: 'Weird',
      polarity: 'unknown',
    });
  });

  it.each([
    ['In', 'allow'],
    ['NotIn', 'deny'],
    ['Exists', 'require'],
    ['DoesNotExist', 'forbid'],
    ['Gt', 'min'],
    ['Lt', 'max'],
  ])('maps operator %s to polarity %s', (operator, polarity) => {
    const entries = parseRequirements([{ key: ARCH_KEY, operator }]);
    expect(entries[0].constraints[0].polarity).toBe(polarity);
  });

  it('handles In with no values without dropping the constraint', () => {
    const entries = parseRequirements([{ key: ARCH_KEY, operator: 'In' }]);

    expect(entries[0].constraints[0].values).toEqual([]);
    expect(entries[0].constraints[0].polarity).toBe('allow');
  });

  it('surfaces minValues', () => {
    const entries = parseRequirements([
      {
        key: 'karpenter.k8s.aws/instance-family',
        operator: 'In',
        values: ['c7g', 'm7g'],
        minValues: 2,
      },
    ]);

    expect(entries[0].constraints[0].minValues).toBe(2);
  });

  it('orders well-known keys by registry order, then unknown keys alphabetically', () => {
    const requirements: RawRequirement[] = [
      { key: 'zzz.example.com/x', operator: 'Exists' },
      { key: ZONE_KEY, operator: 'In', values: ['eu-central-1a'] },
      { key: 'aaa.example.com/y', operator: 'Exists' },
      { key: ARCH_KEY, operator: 'In', values: ['arm64'] },
      { key: CAPACITY_TYPE_KEY, operator: 'In', values: ['spot'] },
    ];

    expect(parseRequirements(requirements).map(e => e.key)).toEqual([
      CAPACITY_TYPE_KEY,
      ARCH_KEY,
      ZONE_KEY,
      'aaa.example.com/y',
      'zzz.example.com/x',
    ]);
  });

  it('carries the unit of a well-known key', () => {
    const entries = parseRequirements([
      {
        key: 'karpenter.k8s.aws/instance-memory',
        operator: 'Gt',
        values: ['8192'],
      },
    ]);

    expect(entries[0].unit).toBe('MiB');
  });
});

describe('findRequirementEntry', () => {
  it('finds by raw key and returns undefined when absent', () => {
    const entries = parseRequirements([
      { key: ARCH_KEY, operator: 'In', values: ['arm64'] },
    ]);

    expect(findRequirementEntry(entries, ARCH_KEY)?.key).toBe(ARCH_KEY);
    expect(findRequirementEntry(entries, CAPACITY_TYPE_KEY)).toBeUndefined();
  });
});

describe('getAllowedValues', () => {
  it('returns undefined when the key is not constrained at all', () => {
    expect(
      getAllowedValues(parseRequirements([]), CAPACITY_TYPE_KEY),
    ).toBeUndefined();
  });

  it('reports allowed values for an In constraint', () => {
    const entries = parseRequirements([
      { key: CAPACITY_TYPE_KEY, operator: 'In', values: ['spot'] },
    ]);

    expect(getAllowedValues(entries, CAPACITY_TYPE_KEY)).toEqual({
      allowed: ['Spot'],
      excluded: [],
      anyValue: false,
    });
  });

  it('reports anyValue for an exclusion-only constraint', () => {
    const entries = parseRequirements([
      {
        key: 'node.kubernetes.io/instance-type',
        operator: 'NotIn',
        values: ['t2.micro'],
      },
    ]);

    expect(
      getAllowedValues(entries, 'node.kubernetes.io/instance-type'),
    ).toEqual({
      allowed: [],
      excluded: ['t2.micro'],
      anyValue: true,
    });
  });

  it('merges and de-duplicates across intersecting constraints', () => {
    const entries = parseRequirements([
      { key: CAPACITY_TYPE_KEY, operator: 'In', values: ['spot', 'on-demand'] },
      { key: CAPACITY_TYPE_KEY, operator: 'In', values: ['spot'] },
      { key: CAPACITY_TYPE_KEY, operator: 'NotIn', values: ['reserved'] },
    ]);

    expect(getAllowedValues(entries, CAPACITY_TYPE_KEY)).toEqual({
      allowed: ['Spot', 'On-demand'],
      excluded: ['Reserved'],
      anyValue: false,
    });
  });
});
