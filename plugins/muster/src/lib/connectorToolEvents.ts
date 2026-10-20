import type { PortalEvent } from '@giantswarm/backstage-plugin-analytics-react';
import type { MCPServerAuth } from './k8s';
import { WIZARD_AUTH_MODES } from './mcpServerDefinition';
import { authModeOf } from './serverAuthMode';

/** An edit of a registered connector, however it was made. */
export const MCP_SERVER_UPDATED: PortalEvent = {
  name: 'Muster.mcpServerUpdated',
  attributes: {},
};

const CONNECTOR_TOOL_EVENTS: Record<string, PortalEvent> = {
  core_mcpserver_update: MCP_SERVER_UPDATED,
  core_mcpserver_delete: { name: 'Muster.mcpServerDeleted', attributes: {} },
  core_service_start: {
    name: 'Muster.mcpServerConnectionChanged',
    attributes: { change: 'activated' },
  },
  core_service_stop: {
    name: 'Muster.mcpServerConnectionChanged',
    attributes: { change: 'deactivated' },
  },
  core_service_restart: {
    name: 'Muster.mcpServerConnectionChanged',
    attributes: { change: 'reconnected' },
  },
};

/**
 * The event a call of one of muster's own connector tools reports, so a
 * connector's lifecycle counts the same from its page and from the tool's.
 * Undefined for any other tool. A registration reports its auth mode, read
 * from the definition the way the wizard's answer maps to it; one whose auth
 * the wizard does not offer (token exchange) has no such answer, and counts
 * as a plain tool run.
 */
export function connectorToolEvent(
  tool: string,
  args: Record<string, unknown>,
): PortalEvent | undefined {
  if (tool === 'core_mcpserver_create') {
    const authMode =
      WIZARD_AUTH_MODES[authModeOf(args.auth as MCPServerAuth | undefined)];
    return authMode
      ? { name: 'Muster.mcpServerAdded', attributes: { authMode } }
      : undefined;
  }
  return Object.hasOwn(CONNECTOR_TOOL_EVENTS, tool)
    ? CONNECTOR_TOOL_EVENTS[tool]
    : undefined;
}
