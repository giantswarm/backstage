import { mockServices } from '@backstage/backend-test-utils';
import type { MCPClient } from '@ai-sdk/mcp';
import { reportedErrorHandler } from '../errors';
import {
  MusterAuthRequiredError,
  MusterMcpClient,
  MUSTER_TOOL_ERROR_STATUS,
  MusterToolError,
  musterServerOfTool,
  musterToolErrorKindOf,
} from './MusterMcpClient';

const SECRET = 'do-not-leak-this-secret';

function buildClient(result: unknown) {
  const logger = mockServices.logger.mock();
  const execute = jest.fn().mockResolvedValue(result);
  const mcpClient = {
    toolsFromDefinitions: jest.fn(({ tools }: { tools: { name: string }[] }) =>
      Object.fromEntries(tools.map(tool => [tool.name, { execute }])),
    ),
    close: jest.fn(),
  } as unknown as MCPClient;
  const client = new MusterMcpClient(
    { name: 'gazelle', url: 'http://muster/mcp' },
    logger,
    () => Promise.resolve(mcpClient),
  );
  return { client, logger };
}

/** muster's `call_tool` answer for a wrapped tool that failed with `text`. */
function failed(text: string) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          content: [{ type: 'text', text }],
          isError: true,
        }),
      },
    ],
    isError: true,
  };
}

async function toolError(
  text: string,
  tool = 'x_agent-manager_update_agent',
): Promise<{
  error: MusterToolError;
  logger: ReturnType<typeof buildClient>['logger'];
}> {
  const { client, logger } = buildClient(failed(text));
  const error = (await client
    .callTool(tool, { token: SECRET }, { authToken: 'user-token' })
    .catch(e => e)) as MusterToolError;
  expect(error).toBeInstanceOf(MusterToolError);
  return { error, logger };
}

describe('MusterMcpClient tool errors', () => {
  it('names the tool, its server and the installation, never the arguments', async () => {
    const { error } = await toolError(
      "Tool execution failed: no answer within the server's timeout of 30s: context deadline exceeded",
    );

    expect(error).toMatchObject({
      name: 'MusterToolError',
      tool: 'x_agent-manager_update_agent',
      server: 'agent-manager',
      installation: 'gazelle',
    });
    expect(JSON.stringify({ ...error })).not.toContain(SECRET);
  });

  it('names the tool called through call_tool, not call_tool', async () => {
    const { error } = await toolError('boom', 'core_workflow_execution_list');

    expect(error.tool).toBe('core_workflow_execution_list');
    // muster's own tools belong to no MCP server.
    expect(error).not.toHaveProperty('server');
  });

  it('names a meta-tool called directly', async () => {
    const { client } = buildClient({
      content: [
        { type: 'text', text: 'Tool execution failed: client not connected' },
      ],
      isError: true,
    });

    const error = await client.filterTools({ pattern: 'x' }).catch(e => e);

    expect(error).toMatchObject({
      tool: 'filter_tools',
      kind: 'client_not_connected',
    });
  });

  it.each([
    ['not_found: agent "a" not found in namespace "b"', 'not_found', 404],
    [
      "invalid_request: agents.api.kagent.dev \"swarmgeist\" is forbidden: ValidatingAdmissionPolicy 'x' with binding 'y' denied request: no",
      'invalid_request',
      400,
    ],
    ['conflict: agent "a" already exists', 'conflict', 409],
    ['gitops_owned: release "a" is applied from git', 'gitops_owned', 409],
    ['forbidden: you may not update agents', 'forbidden', 403],
    ['unsupported: mode commit is not configured', 'unsupported', 400],
    [
      'interrupted: the muster replica serving this call is shutting down (rolling update); retry',
      'interrupted',
      503,
    ],
    [
      "Tool execution failed: no answer within the server's timeout of 30s: context deadline exceeded",
      'timeout',
      504,
    ],
    [
      'Tool execution failed: client not connected',
      'client_not_connected',
      503,
    ],
    [
      'Tool execution failed: tool not found: x_model-manager_list_backends',
      'tool_not_found',
      502,
    ],
    [
      'Tool not found: x_cluster-manager_create_node_pool',
      'tool_not_found',
      502,
    ],
  ])('answers %j as %s, %d', async (text, kind, status) => {
    const { error } = await toolError(text);

    expect(error).toMatchObject({ kind, status, message: text });
  });

  it.each([
    [
      'forbidden: list presets in org-acme: configmaps is forbidden: User "u" cannot list resource "configmaps"',
      'forbidden',
      403,
    ],
    [
      'no_backend: no backend registered on model-manager: 0 valid backend documents in namespace agent-platform',
      'no_backend',
      503,
    ],
  ])("answers model-manager's %j as %s, %d", async (text, kind, status) => {
    const { error } = await toolError(text, 'x_model-manager_list_models');

    expect(error).toMatchObject({ kind, status, server: 'model-manager' });
  });

  it("leaves an MCP server's own capitalised muster wording unknown", async () => {
    const { error } = await toolError(
      'Interrupted: context canceled',
      'x_kubernetes_get',
    );

    expect(error).not.toHaveProperty('kind');
    expect(error).not.toHaveProperty('status');
  });

  it('leaves any other tool error without a kind or status: a 500', async () => {
    const { error } = await toolError(
      'Failed to list executions: unable to parse requirement: values[0][muster.giantswarm.io/workflow]: Invalid value: "a b"',
    );

    expect(error).not.toHaveProperty('kind');
    expect(error).not.toHaveProperty('status');
  });

  it('answers a refusal of a connector write 422, the same text of another tool 500', async () => {
    const refusal = "MCP server 'jira' already exists";

    expect(
      (await toolError(refusal, 'core_mcpserver_create')).error,
    ).toMatchObject({
      kind: 'connector_refused',
      status: 422,
    });
    expect(
      (await toolError(refusal, 'core_mcpserver_get')).error,
    ).not.toHaveProperty('status');
  });

  it("keeps muster's sign-in a 401", async () => {
    const { client } = buildClient({
      content: [
        {
          type: 'text',
          text: "auth_required: server 'jira' requires authentication",
        },
      ],
      structuredContent: { status: 'auth_required', server: 'jira' },
      isError: true,
    });

    const error = (await client
      .callTool('x_jira_search', {})
      .catch(e => e)) as MusterAuthRequiredError;

    expect(error).toBeInstanceOf(MusterAuthRequiredError);
    expect(error.status).toBe(401);
  });

  it.each([
    ['on the call_tool result', 'outer'],
    ['on the wrapped result', 'inner'],
  ])(
    "reads muster's interruption mark %s, whatever the text",
    async (_, where) => {
      const meta = {
        'giantswarm.io/interrupted': { reason: 'shutdown', retryable: true },
      };
      const inner = {
        content: [{ type: 'text', text: 'the call was cancelled' }],
        isError: true,
        ...(where === 'inner' ? { _meta: meta } : {}),
      };
      const { client, logger } = buildClient({
        content: [{ type: 'text', text: JSON.stringify(inner) }],
        isError: true,
        ...(where === 'outer' ? { _meta: meta } : {}),
      });

      const error = (await client
        .callTool('x_agent-manager_list_agents', {})
        .catch(e => e)) as MusterToolError;

      expect(error).toMatchObject({
        kind: 'interrupted',
        status: 503,
        message: 'the call was cancelled',
      });
      expect(logger.info).toHaveBeenCalled();
    },
  );

  it('logs a rollout interruption at info, with the call and not the arguments', async () => {
    const { logger } = await toolError(
      'interrupted: the muster replica serving this call is shutting down (rolling update)',
    );

    expect(logger.info).toHaveBeenCalledWith(
      'Muster tool call was interrupted by a muster rollout',
      expect.objectContaining({
        tool: 'x_agent-manager_update_agent',
        server: 'agent-manager',
        installation: 'gazelle',
      }),
    );
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
    expect(JSON.stringify(jest.mocked(logger.info).mock.calls)).not.toContain(
      SECRET,
    );
  });

  describe('as reportedErrorHandler() answers them', () => {
    async function answer(text: string) {
      const { error } = await toolError(text);
      const json = jest.fn();
      const status = jest.fn(() => ({ json }));
      const next = jest.fn();
      reportedErrorHandler()(
        error,
        { method: 'POST', url: '/call' },
        { headersSent: false, status },
        next,
      );
      return { error, status, json, next };
    }

    it('answers a rollout interruption 503 itself, so the middleware does not report it', async () => {
      const { status, json, next } = await answer(
        'interrupted: the muster replica serving this call is shutting down (rolling update)',
      );

      expect(next).not.toHaveBeenCalled();
      expect(status).toHaveBeenCalledWith(503);
      expect(json.mock.calls[0][0].error).toMatchObject({
        name: 'MusterToolError',
        kind: 'interrupted',
        tool: 'x_agent-manager_update_agent',
      });
      expect(JSON.stringify(json.mock.calls)).not.toContain(SECRET);
    });

    it.each([
      'forbidden: you may not update agents',
      "Tool execution failed: no answer within the server's timeout of 30s",
      'something else went wrong',
    ])('passes %j on to the error middleware, with its status', async text => {
      const { error, status, next } = await answer(text);

      expect(next).toHaveBeenCalledWith(error);
      expect(status).not.toHaveBeenCalled();
    });
  });
});

describe('musterToolErrorKindOf', () => {
  const AGENT_TOOL = 'x_agent-manager_update_agent';

  it('reads only a refusal code at the start', () => {
    expect(musterToolErrorKindOf('conflict: x', AGENT_TOOL)).toBe('conflict');
    expect(musterToolErrorKindOf('not_found:\nno agent', AGENT_TOOL)).toBe(
      'not_found',
    );
    expect(
      musterToolErrorKindOf('request failed: conflict: x', AGENT_TOOL),
    ).toBeUndefined();
    expect(
      musterToolErrorKindOf('backend_error: x', AGENT_TOOL),
    ).toBeUndefined();
  });

  it("reads a refusal by its server's own words", () => {
    expect(
      musterToolErrorKindOf(
        'does_not_fit: llama-70b needs 40 GiB, the backend has 24',
        'x_model-manager_load_model',
      ),
    ).toBe('does_not_fit');
    expect(
      musterToolErrorKindOf(
        'get_workspace: permission denied: you are not a member',
        'x_workspace-manager_get_workspace',
      ),
    ).toBe('not_member');
    expect(
      musterToolErrorKindOf(
        'create_workspace: already exists: docs',
        'x_workspace-manager_create_workspace',
      ),
    ).toBe('already_exists');
  });

  it("leaves another server's code-prefixed error unknown", () => {
    expect(
      musterToolErrorKindOf('not_found: no such pod', 'x_kubernetes_get'),
    ).toBeUndefined();
    expect(
      musterToolErrorKindOf('no_backend: x', 'x_agent-manager_list_agents'),
    ).toBeUndefined();
    expect(
      musterToolErrorKindOf('does_not_fit: x', 'x_agent-manager_update_agent'),
    ).toBeUndefined();
  });

  it.each(['decline', 'cancel'])(
    "reads muster's answer to a sign-in the person answered %s to",
    action => {
      const kind = musterToolErrorKindOf(
        `The tool did not run: the person answered ${action} to signing in to github.`,
        'x_github_get_me',
      );
      expect(kind).toBe('sign_in_declined');
      expect(MUSTER_TOOL_ERROR_STATUS[kind!]).toBe(412);
    },
  );

  it("reads muster's structured interruption whatever its text", () => {
    expect(
      musterToolErrorKindOf('the replica stops', AGENT_TOOL, {
        interrupted: true,
      }),
    ).toBe('interrupted');
  });

  it('keeps a connector failure in the same breath as a refusal a failure', () => {
    expect(
      musterToolErrorKindOf(
        'Cannot store the client credentials of MCP server \'jira\': Permission denied: your user may not create Secret "s". Removing the server failed too',
        'core_mcpserver_create',
      ),
    ).toBeUndefined();
  });
});

describe('musterServerOfTool', () => {
  it.each([
    ['x_model-manager_list_backends', 'model-manager'],
    ['x_kubernetes_gazelle_get', 'kubernetes'],
    ['x_org-acme_github_search_issues', 'github'],
    ['x_org-acme', undefined],
    ['core_workflow_list', undefined],
    ['workflow_deploy', undefined],
    ['x_', undefined],
  ])('reads %s as %s', (tool, server) => {
    expect(musterServerOfTool(tool)).toBe(server);
  });
});
