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
      const tool = name.replace(`x_${server.server}_`, '');
      const handler = server.unservedTools?.(installation).includes(tool)
        ? undefined
        : server.tools[tool];
      if (!handler) {
        throw new Error(`no handler for ${name}`);
      }
      return handler(args, {
        installation,
        signal: new AbortController().signal,
      });
    },
    describeTool: async (name: string, installation: string) => {
      const tool = name.replace(`x_${server.server}_`, '');
      if (server.unservedTools?.(installation).includes(tool)) {
        throw new Error(`Tool not found: ${name}`);
      }
      const schema = server.inputSchemas?.[tool];
      return {
        name,
        server: server.server,
        inputSchema:
          typeof schema === 'function' ? schema(installation) : schema,
      };
    },
  } as unknown as MusterApi;
}
