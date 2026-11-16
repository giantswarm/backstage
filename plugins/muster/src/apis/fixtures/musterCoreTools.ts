import type { FixtureToolHandler } from '../fixtureToolHandlers';

/**
 * muster's own `core_*` tools that the muster pages call through `callTool`
 * and that fixture mode answers, by their full name. Both write nothing: the
 * New connector flow's transport probe and the definition check before a
 * save.
 */
export const musterCoreToolHandlers: Record<string, FixtureToolHandler> = {
  /** Every URL answers as a reachable streamable-HTTP server without OAuth. */
  core_mcpserver_detect: ({ url }) => ({
    transport: 'streamable-http',
    reachable: true,
    requiresAuth: false,
    serverName: 'fixture-mcp-server',
    serverVersion: '1.0.0',
    detail: `${String(url)} completed an MCP handshake over streamable HTTP.`,
  }),
  /** Every definition passes; the save after it is not served. */
  core_mcpserver_validate: ({ name }) =>
    `Validation successful for mcpserver ${String(name)}`,
};
