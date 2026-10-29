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
