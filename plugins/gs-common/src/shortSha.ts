/** How many characters of a git commit SHA the portal shows, as `git log --oneline` does. */
const SHORT_SHA_LENGTH = 7;

/**
 * How many hex characters of a content digest (an OCI artifact's, a Flux
 * checksum) the portal shows, as `docker images` does. A digest is not a
 * commit, and seven of its characters name nothing anyone looks up.
 */
const SHORT_DIGEST_LENGTH = 12;

// A full hash, alone or inside a revision, with the algorithm prefix Flux
// writes where there is one: `main@sha1:<sha>`, `1.2.3@sha256:<digest>`,
// `<ref>@blake3:<digest>`, `1.2.3-<sha>` (a branch build). Only 40 or 64 hex
// characters: an abbreviation is shown as it comes, since its shape cannot
// tell a commit from any other hex token.
const FULL_HASH =
  /\b(?:(sha1|sha256|sha384|sha512|blake3):)?([0-9a-f]{64}|[0-9a-f]{40})\b/gi;

/**
 * A git commit SHA shortened to 7 characters, wherever it sits in the value:
 * a bare SHA-1, a Flux revision (`main@sha1:<sha>`), a version that carries
 * one (`1.2.3-<sha>`). A digest keeps its algorithm prefix and 12 characters:
 * any `sha256:`, `sha384:`, `sha512:` or `blake3:` value, and a bare 64-hex
 * value, which may as well be a checksum as a SHA-256 commit. Anything else
 * is returned as it is, so a tag, a semver, an abbreviated SHA or an S3
 * version id pass through.
 *
 * Where a shortened SHA is shown, the full value stays available (a `title`,
 * or a copy button where there is no hover): ui-react's `CommitSha` does both.
 */
export function shortSha(value: string): string {
  return value.replace(
    FULL_HASH,
    (_match, algorithm: string | undefined, hex: string) => {
      const isCommit = algorithm
        ? algorithm.toLowerCase() === 'sha1'
        : hex.length === 40;
      const prefix = algorithm ? `${algorithm}:` : '';
      return `${prefix}${hex.slice(
        0,
        isCommit ? SHORT_SHA_LENGTH : SHORT_DIGEST_LENGTH,
      )}`;
    },
  );
}
