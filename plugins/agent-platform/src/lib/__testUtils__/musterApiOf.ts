// eslint-disable-next-line @backstage/no-mixed-plugin-imports -- fixture MCP servers are muster's.
import type {
  FixtureMcpServer,
  MusterApi,
} from '@giantswarm/backstage-plugin-muster';

/**
 * A `MusterApi` that answers a fixture server's tools as the fixture
 * `MusterApi` dispatches them, by `x_<server>_<tool>`: for tests that drive
 * a server through its client.
 */
export function musterApiOf(server: FixtureMcpServer): MusterApi {
  return {
    callTool: async (
      name: string,
      args: Record<string, unknown>,
      installation: string,
    ) => {
      const handler = server.tools[name.replace(`x_${server.server}_`, '')];
      if (!handler) {
        throw new Error(`no handler for ${name}`);
      }
      return handler(args, {
        installation,
        signal: new AbortController().signal,
      });
    },
    describeTool: async (name: string) => {
      const tool = name.replace(`x_${server.server}_`, '');
      return {
        name,
        server: server.server,
        inputSchema: server.inputSchemas?.[tool],
      };
    },
  } as unknown as MusterApi;
}
