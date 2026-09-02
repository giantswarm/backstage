import {
  parseIntegerQuantity,
  parseMemoryQuantity,
  sumResourceRequests,
} from './quantity';

describe('parseIntegerQuantity', () => {
  it('parses whole-number strings and numbers', () => {
    expect(parseIntegerQuantity('1')).toBe(1);
    expect(parseIntegerQuantity(' 4 ')).toBe(4);
    expect(parseIntegerQuantity(0)).toBe(0);
  });

  it('refuses fractional, suffixed, negative and missing values', () => {
    expect(parseIntegerQuantity('500m')).toBeUndefined();
    expect(parseIntegerQuantity('2Gi')).toBeUndefined();
    expect(parseIntegerQuantity(1.5)).toBeUndefined();
    expect(parseIntegerQuantity(-1)).toBeUndefined();
    expect(parseIntegerQuantity(undefined)).toBeUndefined();
    expect(parseIntegerQuantity(null)).toBeUndefined();
  });
});

describe('sumResourceRequests', () => {
  it('prefers requests, falls back to limits per block, and sums', () => {
    expect(
      sumResourceRequests(
        [
          {
            requests: { 'nvidia.com/gpu': '1' },
            limits: { 'nvidia.com/gpu': '4' },
          },
          { limits: { 'nvidia.com/gpu': '2' } },
          undefined,
          { requests: { cpu: '2' } },
        ],
        'nvidia.com/gpu',
      ),
    ).toBe(3);
  });

  it('is undefined when nothing declares the resource', () => {
    expect(
      sumResourceRequests([{ requests: { cpu: '1' } }], 'nvidia.com/gpu'),
    ).toBeUndefined();
  });
});

describe('parseMemoryQuantity', () => {
  it('parses binary suffixes into bytes', () => {
    expect(parseMemoryQuantity('1Ki')).toBe(1024);
    expect(parseMemoryQuantity('64Gi')).toBe(64 * 2 ** 30);
    // What a kubelet reports for status.allocatable.memory.
    expect(parseMemoryQuantity('90251888Ki')).toBe(90251888 * 1024);
  });

  it('parses decimal suffixes, exponents and plain bytes', () => {
    expect(parseMemoryQuantity('500M')).toBe(500e6);
    expect(parseMemoryQuantity('1e9')).toBe(1e9);
    expect(parseMemoryQuantity('1.5G')).toBe(1.5e9);
    expect(parseMemoryQuantity('4096')).toBe(4096);
    expect(parseMemoryQuantity(2048)).toBe(2048);
  });

  it('refuses values that are not quantities', () => {
    expect(parseMemoryQuantity('lots')).toBeUndefined();
    expect(parseMemoryQuantity('1Gib')).toBeUndefined();
    expect(parseMemoryQuantity('-1Gi')).toBeUndefined();
    expect(parseMemoryQuantity(undefined)).toBeUndefined();
    expect(parseMemoryQuantity(null)).toBeUndefined();
  });
});
