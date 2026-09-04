import {
  formatArchitecture,
  formatCapacityType,
  formatConsolidationPolicy,
  formatGoDuration,
  formatLimits,
} from './formatters';

describe('formatGoDuration', () => {
  it.each([
    ['30s', '30s'],
    ['1h30m', '1h 30m'],
    ['720h', '30d'],
    ['0s', '0s'],
    ['15m', '15m'],
    ['1h', '1h'],
    ['90m', '1h 30m'],
  ])('formats %s as %s', (input, expected) => {
    expect(formatGoDuration(input)).toBe(expected);
  });

  it("passes through Karpenter's Never", () => {
    expect(formatGoDuration('Never')).toBe('Never');
  });

  it('returns undefined for undefined and empty input', () => {
    expect(formatGoDuration(undefined)).toBeUndefined();
    expect(formatGoDuration('')).toBeUndefined();
  });

  it.each(['12x', 'abc', '5', '10minutes'])(
    'passes through unparseable input %s',
    input => {
      expect(formatGoDuration(input)).toBe(input);
    },
  );

  it('uses at most the two largest units', () => {
    expect(formatGoDuration('1h30m45s')).toBe('1h 30m');
  });
});

describe('formatLimits', () => {
  it('returns an empty array for undefined limits', () => {
    expect(formatLimits(undefined)).toEqual([]);
  });

  it('stringifies numeric and string values and sorts by resource', () => {
    expect(
      formatLimits({ memory: '1000Gi', 'nvidia.com/gpu': 8, cpu: '1000' }),
    ).toEqual([
      { resource: 'cpu', value: '1000' },
      { resource: 'memory', value: '1000Gi' },
      { resource: 'nvidia.com/gpu', value: '8' },
    ]);
  });
});

describe('value formatters', () => {
  it('labels capacity types, passing through unknown values', () => {
    expect(formatCapacityType('spot')).toBe('Spot');
    expect(formatCapacityType('on-demand')).toBe('On-demand');
    expect(formatCapacityType('something-new')).toBe('something-new');
  });

  it('labels architectures, passing through unknown values', () => {
    expect(formatArchitecture('arm64')).toBe('arm64 (Graviton)');
    expect(formatArchitecture('amd64')).toBe('amd64 (x86_64)');
    expect(formatArchitecture('riscv64')).toBe('riscv64');
  });

  it('labels consolidation policies', () => {
    expect(formatConsolidationPolicy('WhenEmpty')).toBe('When empty');
    expect(formatConsolidationPolicy('WhenEmptyOrUnderutilized')).toBe(
      'When empty or underutilized',
    );
    expect(formatConsolidationPolicy(undefined)).toBeUndefined();
  });
});
