import {
  createExtensionDataRef,
  createExtensionInput,
} from '@backstage/frontend-plugin-api';
import { FIXTURE_MCP_SERVERS } from '@giantswarm/backstage-plugin-gs-common';

/**
 * What a fixture tool handler is called with besides the tool's arguments:
 * the installation the call targets and the caller's abort signal.
 */
export type FixtureToolCallContext = {
  installation: string;
  signal?: AbortSignal;
};

/**
 * Answers one tool call in fixture mode with what the tool's MCP server would
 * answer, after the muster proxy has parsed it (the value `callTool`
 * resolves with). A thrown error fails the call.
 */
export type FixtureToolHandler = (
  args: Record<string, unknown>,
  context: FixtureToolCallContext,
) => unknown;

/**
 * The fixture of one MCP server behind muster: the name muster exposes it as
 * (`x_<server>_<tool>`) and a handler per tool, keyed by the tool's own name.
 * Fixture mode lists the server as connected, and its tools in the catalogue.
 */
export type FixtureMcpServer = {
  server: string;
  tools: Record<string, FixtureToolHandler>;
};

/**
 * Loads fixture MCP servers. Called once, on the fixture `MusterApi`'s first
 * call, so the handler code stays in a chunk of its own.
 */
export type FixtureMcpServersLoader = () => Promise<FixtureMcpServer[]>;

/**
 * Data of an extension that contributes fixture MCP servers to the fixture
 * `MusterApi` (docs/fixtures.md). A plugin whose pages call an MCP server's
 * tools through muster attaches one to `FIXTURE_MCP_SERVERS.attachTo`
 * (`@giantswarm/backstage-plugin-gs-common`), and loads its handler modules with a dynamic `import()`
 * behind `process.env.NODE_ENV !== 'production'`, so no handler code reaches a
 * production build.
 */
export const fixtureMcpServersDataRef =
  createExtensionDataRef<FixtureMcpServersLoader>().with({
    id: FIXTURE_MCP_SERVERS.dataRefId,
  });

/** The `fixtureServers` input of `api:muster/muster`. */
export const fixtureMcpServersInput = createExtensionInput([
  fixtureMcpServersDataRef,
]);
