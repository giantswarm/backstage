import { ToolAnnotations } from '../apis';

/**
 * What a server says its own tool does, read from the MCP tool annotations
 * muster forwards verbatim.
 *
 * These live here rather than beside the toolset logic in `agent-platform`
 * because the annotations are a muster wire type and every surface that lists
 * a tool wants the same answer from them — the Tool Explorer, the servers page
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
