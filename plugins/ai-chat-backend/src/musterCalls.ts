import type { StopCondition, Tool, ToolSet } from 'ai';
import {
  type McpContentItem,
  type MusterInputAnswer,
  MusterInputRequiredError,
  type MusterMcpClient,
  MusterToolError,
} from '@giantswarm/backstage-plugin-gs-node';
import {
  type MusterToolInputRequired,
  toolInputRequiredOf,
} from '@giantswarm/backstage-plugin-gs-common';

/** muster's meta-tool that runs an aggregated tool by name. */
export const MUSTER_CALL_TOOL = 'call_tool';

/**
 * What a muster call hands the model, in the shape of an MCP tool result.
 * `inputRequired` is set when muster asked the person to open a page first:
 * the tool has not run, and the page puts the elicitations to the person.
 */
export interface MusterCallOutput {
  content: McpContentItem[];
  isError?: boolean;
  inputRequired?: MusterToolInputRequired;
}

export interface MusterCall {
  tool: string;
  arguments: Record<string, unknown>;
  authToken?: string;
  input?: MusterInputAnswer;
  signal?: AbortSignal;
}

function textOutput(text: string, isError: boolean): MusterCallOutput {
  return { content: [{ type: 'text', text }], isError };
}

/**
 * Calls an aggregated tool through muster, declaring URL elicitation. A tool
 * error becomes an error result the model reads, as muster worded it (a
 * declined sign-in among them); a sign-in muster asks for becomes an error
 * result that also carries the elicitations for the page. Anything else, a
 * muster that cannot be reached among them, throws.
 */
export async function callMusterTool(
  client: MusterMcpClient,
  call: MusterCall,
): Promise<MusterCallOutput> {
  try {
    const content = await client.callToolContent(call.tool, call.arguments, {
      authToken: call.authToken,
      urlElicitation: true,
      input: call.input,
      signal: call.signal,
    });
    return { content };
  } catch (error) {
    if (error instanceof MusterInputRequiredError) {
      return {
        ...textOutput(
          `The tool did not run: ${error.message} The person is asked in the chat; the call runs once they answer, so do not call the tool again.`,
          true,
        ),
        inputRequired: {
          tool: call.tool,
          arguments: call.arguments,
          elicitations: error.elicitations,
          ...(error.requestState !== undefined
            ? { requestState: error.requestState }
            : {}),
        },
      };
    }
    if (error instanceof MusterToolError) {
      return textOutput([error.message, ...error.details].join('\n'), true);
    }
    throw error;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * `call_tool` of muster's MCP listing, run through {@link callMusterTool}
 * instead of the listing's client, which cannot declare URL elicitation.
 */
export function withMusterCallTool(
  callTool: Tool,
  client: MusterMcpClient,
  authToken: string | undefined,
): Tool {
  return {
    ...callTool,
    execute: async (input: unknown, options: { abortSignal?: AbortSignal }) => {
      const { name, arguments: args } = isRecord(input) ? input : {};
      if (typeof name !== 'string' || name === '') {
        return textOutput(
          'call_tool needs the name of the tool to call.',
          true,
        );
      }
      return callMusterTool(client, {
        tool: name,
        arguments: isRecord(args) ? args : {},
        authToken,
        signal: options?.abortSignal,
      });
    },
  } as Tool;
}

/**
 * Ends the turn after a step in which muster asked the person to open a
 * page: the page puts it to them and sends the call again, and the model
 * continues with that call's result.
 */
export const musterInputRequired: StopCondition<ToolSet> = ({ steps }) =>
  steps
    .at(-1)
    ?.toolResults.some(result => toolInputRequiredOf(result.output)) ?? false;
