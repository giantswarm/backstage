import { ToolAnnotations } from '../apis';

/**
 * What a server says its own tool does, read from the MCP tool annotations
 * muster forwards verbatim.
 *
 * These live here rather than beside the toolset logic in `agent-platform`
 * because the annotations are a muster wire type and every surface that lists
 * a tool wants the same answer from them — a server's Tools tab, a tool page
 * and an agent's toolset must not disagree about whether a tool is
 * destructive. `agent-platform` re-exports them for its existing callers.
 */

/** Annotated read-only by its server. */
export function isReadOnly(tool: { annotations?: ToolAnnotations }): boolean {
  return tool.annotations?.readOnlyHint === true;
}

/**
 * Destructive only when the server does not also call the tool read-only: the
 * MCP spec defaults `destructiveHint` to true and defines it only for tools
 * that are not read-only, and servers do send both (agent-manager's
 * `get_agent` arrives with `readOnlyHint: true, destructiveHint: true`).
 */
export function isDestructive(tool: {
  annotations?: ToolAnnotations;
}): boolean {
  return (
    tool.annotations?.destructiveHint === true &&
    tool.annotations?.readOnlyHint !== true
  );
}

/**
 * What running a tool does, in the two kinds a person approves differently:
 * it only reads, or it changes things.
 */
export type ToolEffect = 'reads' | 'changes';

/**
 * A tool reads only when its server annotates it read-only. Without the
 * annotation it changes things: the MCP spec defaults `readOnlyHint` to false,
 * and a tool that might write must not be presented as harmless.
 */
export function toolEffect(tool: {
  annotations?: ToolAnnotations;
}): ToolEffect {
  return isReadOnly(tool) ? 'reads' : 'changes';
}
