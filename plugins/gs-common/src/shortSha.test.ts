import { shortSha } from './shortSha';

const SHA1 = '0123456789abcdef0123456789abcdef01234567';
const SHA256 = 'f'.repeat(64);

describe('shortSha', () => {
  it.each([
    ['a bare SHA-1 commit', SHA1, '0123456'],
    ['an upper-case commit', SHA1.toUpperCase(), '0123456'],
    ['a SHA-256 commit', SHA256, 'fffffff'],
    ['an abbreviated commit', '0123456789ab', '0123456'],
    ['a Flux git revision', `main@sha1:${SHA1}`, 'main@sha1:0123456'],
    ['a legacy Flux revision', `main/${SHA1}`, 'main/0123456'],
    ['a branch build version', `1.2.3-${SHA1}`, '1.2.3-0123456'],
    ['a Git-sourced chart version', '1.2.3+0123456789ab', '1.2.3+0123456'],
  ])('shortens %s to seven characters', (_name, value, short) => {
    expect(shortSha(value)).toBe(short);
  });

  it.each([
    ['a digest', `sha256:${SHA256}`, `sha256:${'f'.repeat(12)}`],
    [
      'an OCI revision',
      `1.2.3@sha256:${SHA256}`,
      `1.2.3@sha256:${'f'.repeat(12)}`,
    ],
    [
      'an OCI reference',
      `ghcr.io/org/skills@sha256:${SHA256}`,
      `ghcr.io/org/skills@sha256:${'f'.repeat(12)}`,
    ],
  ])('keeps twelve characters of %s', (_name, value, short) => {
    expect(shortSha(value)).toBe(short);
  });

  it.each([
    '1.2.3',
    'v1.2.3-rc.1',
    '1.2.3+20240101123456',
    '20240101123456',
    '0123456',
    'v-42',
    'main',
    '',
  ])('leaves %p as it is', value => {
    expect(shortSha(value)).toBe(value);
  });
});
