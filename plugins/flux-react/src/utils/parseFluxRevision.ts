/**
 * Parses Flux CD artifact revision and extracts the commit identifier.
 *
 * Flux revision formats (per RFC-0005):
 * - Legacy: "da19eed209e82ec009912e5c0396343651030972"
 * - New: "main@sha1:da19eed209e82ec009912e5c0396343651030972"
 * - Digest only: "sha256:8fb62a09c9e48ace..."
 * - Named pointer only: "1.2.3"
 *
 * @param revision Raw revision from status.artifact.revision
 * @returns Extracted commit SHA or original value
 */
export function parseFluxRevision(revision: string): string {
  // Check for new format with @ separator
  if (revision.includes('@')) {
    const lastAtIndex = revision.lastIndexOf('@');
    const digestPart = revision.substring(lastAtIndex + 1);

    // Format: algo:checksum
    if (digestPart.includes(':')) {
      const colonIndex = digestPart.indexOf(':');
      return digestPart.substring(colonIndex + 1);
    }

    return digestPart;
  }

  // Digest-only format (algo:checksum without @)
  if (revision.includes(':')) {
    const colonIndex = revision.indexOf(':');
    return revision.substring(colonIndex + 1);
  }

  // Legacy format - return as-is
  return revision;
}
