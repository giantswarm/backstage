export function formatVersion(version: string) {
  // Remove the `v` prefix if it's present.
  return version.startsWith('v') ? version.slice(1) : version;
}
