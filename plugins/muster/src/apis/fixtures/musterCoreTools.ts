import type { FixtureToolHandler } from '../fixtureToolHandlers';
import { musterConnectorFixtureState } from './musterConnectorFixtureState';

/**
 * muster's own `core_*` tools that the muster pages call through `callTool`
 * and that fixture mode answers, by their full name: the New connector flow's
 * transport probe and the definition check before a save, and the writes to
 * an installation's connectors, which `musterConnectorFixtureState` keeps
 * until the page reloads.
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
  /** Every definition passes. */
  core_mcpserver_validate: ({ name }) =>
    `Validation successful for mcpserver ${String(name)}`,
  core_mcpserver_create: (args, { installation }) =>
    musterConnectorFixtureState().create(installation, args),
  core_mcpserver_update: (args, { installation }) =>
    musterConnectorFixtureState().update(installation, args),
  core_mcpserver_delete: (args, { installation }) =>
    musterConnectorFixtureState().delete(installation, args),
  core_service_start: (args, { installation }) =>
    musterConnectorFixtureState().start(installation, args),
  core_service_stop: (args, { installation }) =>
    musterConnectorFixtureState().stop(installation, args),
  core_service_restart: (args, { installation }) =>
    musterConnectorFixtureState().restart(installation, args),
};
