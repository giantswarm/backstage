/** How many characters of a git commit SHA the portal shows, as `git log --oneline` does. */
export const SHORT_SHA_LENGTH = 7;

/**
 * How many hex characters of a `sha256:` content digest (an OCI artifact's)
 * the portal shows, as `docker images` does. A digest is not a commit, and
 * seven of its characters name nothing anyone looks up.
 */
export const SHORT_DIGEST_LENGTH = 12;

// A full commit SHA (SHA-1, or a SHA-256 repository's), alone or inside a
// revision: `main@sha1:<sha>` (Flux), `1.2.3-<sha>` (a branch build), or a
// `sha256:<digest>`, which keeps its prefix.
const FULL_HASH = /(sha256:)?\b([0-9a-f]{64}|[0-9a-f]{40})\b/gi;

// A whole value that is an abbreviated commit, as some sources hand one over
// (`git rev-parse --short=12`): hex with at least one letter, so a number is
// kept.
const ABBREVIATED_SHA = /^(?=[0-9]*[a-f])[0-9a-f]{8,39}$/i;

// The commit Flux appends to a Git-sourced chart's version as build metadata,
// `1.2.3+<12 hex>`: at least one letter, so a numeric build stamp is kept.
const BUILD_METADATA_SHA = /\+(?=[0-9]*[a-f])([0-9a-f]{12})$/i;

/**
 * A git commit SHA shortened to {@link SHORT_SHA_LENGTH} characters, wherever
 * it sits in the value: a bare SHA, full or already abbreviated, a Flux
 * revision (`main@sha1:<sha>`), a version that carries one (`1.2.3-<sha>`,
 * `1.2.3+<sha>`). A `sha256:` digest keeps its prefix and
 * {@link SHORT_DIGEST_LENGTH} characters. Anything else is returned as it is,
 * so a tag, a semver or an S3 version id pass through.
 *
 * Where a shortened SHA is shown, the full value stays available (a `title`,
 * or a copy button where there is no hover): ui-react's `CommitSha` does both.
 */
export function shortSha(value: string): string {
  if (ABBREVIATED_SHA.test(value)) {
    return value.slice(0, SHORT_SHA_LENGTH);
  }
  return value
    .replace(FULL_HASH, (_match, digest: string | undefined, hex: string) =>
      digest
        ? `${digest}${hex.slice(0, SHORT_DIGEST_LENGTH)}`
        : hex.slice(0, SHORT_SHA_LENGTH),
    )
    .replace(
      BUILD_METADATA_SHA,
      (_match, hex: string) => `+${hex.slice(0, SHORT_SHA_LENGTH)}`,
    );
}
