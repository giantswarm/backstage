import { loadAll } from 'js-yaml';

/**
 * Parse a single YAML document, tolerating empty input.
 *
 * js-yaml v5's `load()` throws on empty, whitespace-only or comment-only input
 * (v4 returned `undefined`). `loadAll()` instead returns `[]` for those cases
 * and still throws on genuinely malformed YAML, so taking the first document
 * restores the pre-v5 "empty -> undefined" behaviour these call sites rely on.
 */
export function loadYamlDocument(input: string): unknown {
  return loadAll(input)[0];
}
