import {
  PLATFORM_API_GROUPS,
  PLATFORM_COMPONENTS,
  PlatformComponents,
} from './types';

/** The answer before any probe: nothing is known to be installed. */
export const NO_PLATFORM_COMPONENTS: PlatformComponents = Object.freeze({
  kagent: false,
  muster: false,
  kserve: false,
  capi: false,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Whether a value is a components record, the shape this module stores in
 * the query cache. That cache is persisted to localStorage across releases, so
 * an entry under the inventory key may have been written by another version
 * of the code with another shape; anything but a complete boolean record reads
 * as "not answered yet" and is fetched again (the persisted-cache rule).
 */
export function isPlatformComponents(
  value: unknown,
): value is PlatformComponents {
  return (
    isRecord(value) &&
    PLATFORM_COMPONENTS.every(
      component => typeof value[component] === 'boolean',
    )
  );
}

/**
 * Reads which platform components an installation runs from an
 * `APIGroupList` (`GET /apis`): `{ kind: 'APIGroupList', groups: [{ name,
 * versions, preferredVersion }, ...] }`. Group presence is the whole question,
 * so only `groups[].name` is read and malformed entries are skipped.
 *
 * A body without a `groups` array is not an API group list at all (a proxy
 * error page, an HTML sign-in form) and throws, rather than reading as "no
 * components", which would silently empty every tab.
 */
export function parseApiGroupList(body: unknown): PlatformComponents {
  if (!isRecord(body) || !Array.isArray(body.groups)) {
    const error = new Error(
      'Expected an APIGroupList with a `groups` array in the /apis answer.',
    );
    error.name = 'ApiGroupListShapeError';
    throw error;
  }
  const names = new Set<string>();
  for (const group of body.groups) {
    if (isRecord(group) && typeof group.name === 'string') {
      names.add(group.name);
    }
  }
  return Object.fromEntries(
    PLATFORM_COMPONENTS.map(component => [
      component,
      names.has(PLATFORM_API_GROUPS[component]),
    ]),
  ) as PlatformComponents;
}
