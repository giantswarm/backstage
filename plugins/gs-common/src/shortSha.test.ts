import { shortSha } from './shortSha';

const SHA1 = '0123456789abcdef0123456789abcdef01234567';
const HEX64 = 'f'.repeat(64);
const SHORT_DIGEST = 'f'.repeat(12);

describe('shortSha', () => {
  it.each([
    ['a bare SHA-1 commit', SHA1, '0123456'],
    ['an upper-case commit', SHA1.toUpperCase(), '0123456'],
    ['a Flux git revision', `main@sha1:${SHA1}`, 'main@sha1:0123456'],
    ['a legacy Flux revision', `main/${SHA1}`, 'main/0123456'],
    ['a branch build version', `1.2.3-${SHA1}`, '1.2.3-0123456'],
  ])('shortens %s to seven characters', (_name, value, short) => {
    expect(shortSha(value)).toBe(short);
  });

  it.each([
    ['a sha256 digest', `sha256:${HEX64}`, `sha256:${SHORT_DIGEST}`],
    ['a blake3 digest', `main@blake3:${HEX64}`, `main@blake3:${SHORT_DIGEST}`],
    ['a sha512 digest', `sha512:${HEX64}`, `sha512:${SHORT_DIGEST}`],
    [
      'an OCI revision',
      `1.2.3@sha256:${HEX64}`,
      `1.2.3@sha256:${SHORT_DIGEST}`,
    ],
    [
      'an OCI reference',
      `ghcr.io/org/skills@sha256:${HEX64}`,
      `ghcr.io/org/skills@sha256:${SHORT_DIGEST}`,
    ],
    // A checksum as likely as a SHA-256 commit: the shape cannot tell.
    ['a bare 64-hex value', HEX64, SHORT_DIGEST],
  ])('keeps twelve characters of %s', (_name, value, short) => {
    expect(shortSha(value)).toBe(short);
  });

  it.each([
    '1.2.3',
    'v1.2.3-rc.1',
    // Flux's commit build metadata is already 12 characters: as it comes.
    '1.2.3+0123456789ab',
    // An abbreviation, or any other hex token: its shape says nothing.
    '0123456789ab',
    '123456789012',
    'cafebabe12',
    '0123456',
    'v-42',
    'main',
    '',
  ])('leaves %p as it is', value => {
    expect(shortSha(value)).toBe(value);
  });
});
