/**
 * An edit of a registered connector as muster's write tools take it.
 *
 * muster with tool approval splits the connector writes so that each can be
 * governed on its own (`internal/mcpserver/connector_writes.go`):
 * `core_mcpserver_connect` takes where the server is and how muster reaches
 * it (type, URL, headers, sign-in, client, family, tool prefix, ...),
 * `core_mcpserver_update` what changes no target (description, display name,
 * tags, autoStart, timeout, suspended, restart), `core_mcpserver_set_approval`
 * the tool approval. Each refuses the others' arguments (`<tool> does not take
 * <args>: use <other tool>`) before it writes anything. An older muster has
 * one `core_mcpserver_update` that takes everything.
 */

/** The write that takes what changes no target. */
export const CONNECTOR_UPDATE_TOOL = 'core_mcpserver_update';

/** The write that takes where the server is and how muster reaches it. */
export const CONNECTOR_CONNECT_TOOL = 'core_mcpserver_connect';

/** A tool's input schema as `describe_tool` reports it. */
export type WriteToolSchema = { properties?: Record<string, unknown> };

/** One call of a connector write. */
export type ConnectorWrite = {
  tool: string;
  args: Record<string, unknown>;
};

/**
 * The calls an edit's arguments take: split by the arguments
 * `core_mcpserver_connect` declares, the connection first, then the rest
 * through `core_mcpserver_update`; one update, as before, on a muster
 * without `connect` (`connectSchema` undefined). An argument `connect` does
 * not declare goes to the update, which refuses what it does not take, in
 * muster's words, naming the tool that does: nothing is dropped silently.
 * Each call carries the connector's `name`; a call with nothing else is left
 * out, but an edit always makes at least one call.
 */
export function connectorEditWrites(
  args: Record<string, unknown>,
  connectSchema: WriteToolSchema | undefined,
): ConnectorWrite[] {
  if (!connectSchema) {
    return [{ tool: CONNECTOR_UPDATE_TOOL, args }];
  }
  const takes = connectSchema.properties ?? {};
  const { name, ...rest } = args;
  const connect: Record<string, unknown> = { name };
  const update: Record<string, unknown> = { name };
  for (const [key, value] of Object.entries(rest)) {
    if (Object.prototype.hasOwnProperty.call(takes, key)) {
      connect[key] = value;
    } else {
      update[key] = value;
    }
  }
  const writes: ConnectorWrite[] = [];
  if (Object.keys(connect).length > 1) {
    writes.push({ tool: CONNECTOR_CONNECT_TOOL, args: connect });
  }
  if (Object.keys(update).length > 1 || writes.length === 0) {
    writes.push({ tool: CONNECTOR_UPDATE_TOOL, args: update });
  }
  return writes;
}

/**
 * Whether an edit's write takes `argument`: `connect` or, on an older muster
 * without it, the one `update`. Undefined while either schema is unknown.
 */
export function editTakesArgument(
  argument: string,
  schemas: {
    update: WriteToolSchema | undefined;
    /** `null`: this muster has no `connect`. */
    connect: WriteToolSchema | null | undefined;
  },
): boolean | undefined {
  const { update, connect } = schemas;
  if (connect?.properties?.[argument] || update?.properties?.[argument]) {
    return true;
  }
  if (update === undefined || connect === undefined) {
    return undefined;
  }
  return false;
}
