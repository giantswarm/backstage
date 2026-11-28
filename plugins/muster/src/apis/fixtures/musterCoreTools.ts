import type { FixtureToolHandler } from '../fixtureToolHandlers';
import { isUnreachableUrl, musterFixtureState } from './musterFixtureState';

/**
 * muster's own `core_*` tools that the muster pages call through `callTool`
 * and that fixture mode answers, by their full name: the New connector flow's
 * transport probe and the definition check before a save, and the writes to
 * an installation's connectors, which `musterFixtureState` keeps
 * until the page reloads.
 */
export const musterCoreToolHandlers: Record<string, FixtureToolHandler> = {
  /**
   * Every URL answers as a reachable streamable-HTTP server without OAuth,
   * but one muster cannot reach ({@link isUnreachableUrl}), which no probe
   * gets an answer from, in muster's words (`internal/mcpserver/detect.go`).
   */
  core_mcpserver_detect: ({ url }) => {
    const address = String(url);
    if (isUnreachableUrl(address)) {
      let host = address;
      try {
        host = new URL(address).hostname;
      } catch {
        // Not a URL: name it as given.
      }
      const lookup = `dial tcp: lookup ${host}: no such host`;
      return {
        transport: 'unknown',
        reachable: false,
        requiresAuth: false,
        detail: `no probe succeeded (streamable-http: Post "${address}": ${lookup}; sse: Get "${address}": ${lookup})`,
      };
    }
    return {
      transport: 'streamable-http',
      reachable: true,
      requiresAuth: false,
      serverName: 'fixture-mcp-server',
      serverVersion: '1.0.0',
      detail: 'initialize handshake succeeded over streamable-http',
    };
  },
  /** Every definition passes. */
  core_mcpserver_validate: ({ name }) =>
    `Validation successful for mcpserver ${String(name)}`,
  core_mcpserver_create: (args, { installation }) =>
    musterFixtureState().create(installation, args),
  core_mcpserver_update: (args, { installation }) =>
    musterFixtureState().update(installation, args),
  core_mcpserver_connect: (args, { installation }) =>
    musterFixtureState().connectWrite(installation, args),
  core_mcpserver_set_approval: (args, { installation }) =>
    musterFixtureState().setApproval(installation, args),
  core_mcpserver_delete: (args, { installation }) =>
    musterFixtureState().delete(installation, args),
  core_service_start: (args, { installation }) =>
    musterFixtureState().start(installation, args),
  core_service_stop: (args, { installation }) =>
    musterFixtureState().stop(installation, args),
  core_service_restart: (args, { installation }) =>
    musterFixtureState().restart(installation, args),
};
