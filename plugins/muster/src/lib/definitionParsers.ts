import { load } from 'js-yaml';

/**
 * Parsers for the definition editors: each turns the editor's text into the
 * muster tool's arguments, or throws an `Error` whose message the dialog shows.
 */

/** An MCP server definition, as JSON. */
export function parseJsonDefinition(value: string): Record<string, unknown> {
  try {
    return JSON.parse(value);
  } catch (e) {
    throw new Error(`Invalid JSON: ${(e as Error).message}`);
  }
}

/** A workflow definition, as a YAML mapping. */
export function parseYamlDefinition(value: string): Record<string, unknown> {
  let obj: unknown;
  try {
    obj = load(value);
  } catch (e) {
    // js-yaml v5 throws on empty/comment-only input (v4 returned undefined),
    // so those land here and are reported as invalid YAML.
    throw new Error(`Invalid YAML: ${(e as Error).message}`);
  }
  // A scalar or array is a valid YAML document but not a valid workflow
  // definition. Reject non-mappings explicitly so the editor doesn't silently
  // no-op.
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new Error('Workflow definition must be a YAML mapping.');
  }
  return obj as Record<string, unknown>;
}
