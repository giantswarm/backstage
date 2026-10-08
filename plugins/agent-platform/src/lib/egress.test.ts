import {
  EGRESS_ORIGIN_PATTERN,
  egressProblem,
  egressTextOf,
  parseEgressText,
} from './egress';

describe('EGRESS_ORIGIN_PATTERN', () => {
  it.each([
    'https://github.com',
    'https://github.com:443',
    'http://proxy.internal:3128',
    'https://*.githubusercontent.com',
    'https://registry-1.docker.io:443',
    'https://localhost',
  ])('accepts %s', origin => {
    expect(EGRESS_ORIGIN_PATTERN.test(origin)).toBe(true);
  });

  it.each([
    'github.com',
    'https://GitHub.com',
    'https://github.com/',
    'https://github.com/giantswarm',
    'https://*.com',
    'https://*',
    'https://a.*.example.com',
    'https://github.com:0',
    'https://github.com:65536',
    'ftp://github.com',
    'https://-bad.example.com',
  ])('refuses %s', origin => {
    expect(EGRESS_ORIGIN_PATTERN.test(origin)).toBe(false);
  });
});

describe('parseEgressText / egressTextOf', () => {
  it('reads one origin per line and drops blanks and spaces', () => {
    expect(
      parseEgressText(
        '  https://github.com:443 \n\n https://*.githubusercontent.com\n',
      ),
    ).toEqual(['https://github.com:443', 'https://*.githubusercontent.com']);
    expect(parseEgressText('')).toEqual([]);
  });

  it('round-trips a list through the text', () => {
    const origins = ['https://a.example.com', 'https://b.example.com:8443'];
    expect(parseEgressText(egressTextOf(origins))).toEqual(origins);
    expect(egressTextOf(undefined)).toBe('');
  });
});

describe('egressProblem', () => {
  it('accepts a valid list and an empty one', () => {
    expect(egressProblem([])).toBeUndefined();
    expect(
      egressProblem([
        'https://github.com:443',
        'https://*.githubusercontent.com',
      ]),
    ).toBeUndefined();
  });

  it('names the entry that is not an origin', () => {
    expect(egressProblem(['https://github.com', 'github.com/giantswarm'])).toBe(
      'Egress origin "github.com/giantswarm" is not an http(s) origin such as https://github.com:443 or https://*.githubusercontent.com (lowercase host, optional port, no path)',
    );
  });

  it('names a duplicate', () => {
    expect(egressProblem(['https://github.com', 'https://github.com'])).toBe(
      'Egress origin "https://github.com" is listed twice',
    );
  });

  it('bounds the count and the length', () => {
    const many = Array.from(
      { length: 65 },
      (_, i) => `https://h${i}.example.com`,
    );
    expect(egressProblem(many)).toBe('65 egress origins; the limit is 64');
    const long = `https://${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(63)}.example.com`;
    expect(long.length).toBeGreaterThan(270);
    expect(egressProblem([long])).toMatch(/longer than 270 characters$/);
  });
});
