/**
 * Deep merge objects using Helm-style merging logic.
 * - Objects are merged recursively
 * - Arrays and primitives are replaced (not merged)
 * - null/undefined sources are skipped
 */
export function helmMerge(target: any, source: any): any {
  if (source === null || source === undefined) {
    return target;
  }
  if (target === null || target === undefined) {
    return source;
  }

  if (typeof source !== 'object' || Array.isArray(source)) {
    return source;
  }

  const result = { ...target };
  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      if (
        typeof source[key] === 'object' &&
        source[key] !== null &&
        !Array.isArray(source[key]) &&
        typeof result[key] === 'object' &&
        result[key] !== null &&
        !Array.isArray(result[key])
      ) {
        result[key] = helmMerge(result[key], source[key]);
      } else {
        result[key] = source[key];
      }
    }
  }
  return result;
}
