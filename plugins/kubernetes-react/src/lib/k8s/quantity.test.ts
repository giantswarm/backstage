import { parseIntegerQuantity, sumResourceRequests } from './quantity';

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
