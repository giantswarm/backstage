import type { FixtureMcpServer } from '../fixtureToolHandlers';
import { musterCoreToolHandlers } from './musterCoreTools';

/** `x_<server>_<tool>`: how muster exposes an aggregated server's tool. */
export function fixtureToolName(server: string, tool: string): string {
  return `x_${server}_${tool}`;
}

/**
 * Every tool name the fixture `MusterApi` built with `servers` answers in
 * `callTool`: the servers' tools and muster's own it serves.
 */
export function fixtureToolNames(servers: FixtureMcpServer[]): Set<string> {
  return new Set([
    ...servers.flatMap(({ server, tools }) =>
      Object.keys(tools).map(tool => fixtureToolName(server, tool)),
    ),
    ...Object.keys(musterCoreToolHandlers),
  ]);
}
