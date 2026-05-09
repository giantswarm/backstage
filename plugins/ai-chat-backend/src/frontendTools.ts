import { jsonSchema } from 'ai';
import type { JSONSchema7 } from 'json-schema';

// `tools` is optional in the request schema (`z.any().optional()`), so it
// arrives as `undefined` whenever the frontend does not register any
// client-side tools (assistant-ui's default transport). Calling
// `Object.entries(undefined)` would throw and surface to the user as a
// generic 500 / "network error" on every chat send.
export const frontendTools = (
  tools:
    | Record<string, { description?: string; parameters: JSONSchema7 }>
    | null
    | undefined,
) =>
  Object.fromEntries(
    Object.entries(tools ?? {}).map(([name, tool]) => [
      name,
      {
        ...(tool.description ? { description: tool.description } : undefined),
        inputSchema: jsonSchema(tool.parameters),
      },
    ]),
  );
