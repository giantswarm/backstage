// eslint-disable-next-line @backstage/no-mixed-plugin-imports -- fixture MCP servers are muster's.
import type { FixtureMcpServer } from '@giantswarm/backstage-plugin-muster';

/** A value as JSON carries it: a tool call never shares objects. */
export function copied<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

/**
 * A server's handlers with their arguments and answers crossing as JSON, as
 * over MCP: no caller shares a fixture state's objects.
 */
export function asJson(
  tools: FixtureMcpServer['tools'],
): FixtureMcpServer['tools'] {
  return Object.fromEntries(
    Object.entries(tools).map(([name, handler]) => [
      name,
      (args, context) => copied(handler(copied(args), context)),
    ]),
  );
}

/** A tool argument as a string, `''` without one. */
export function text(args: Record<string, unknown>, key: string): string {
  return String(args[key] ?? '');
}
