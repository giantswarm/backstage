import { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { analyticsApiRef } from '@backstage/core-plugin-api';
import { mockApis, TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { musterApiRef, type MusterApi } from '../../apis';
import type { McpServerDefinition } from '../../lib/mcpServerDefinition';
import {
  OneTimeClientCredentials,
  useRegisterMcpServer,
  type McpServerRegistration,
} from './useRegisterMcpServer';

const callTool = jest.fn();
const describeTool = jest.fn();
const musterApi = { callTool, describeTool } as unknown as MusterApi;
const analyticsApi = mockApis.analytics.mock();

const definition: McpServerDefinition = {
  name: 'github',
  type: 'streamable-http',
  url: 'https://mcp.example.com/mcp',
  autoStart: true,
};

const registration: McpServerRegistration = {
  definition,
  installation: 'gazelle',
  authMode: 'own-account',
  isEdit: false,
  startedFromEdit: false,
};

function renderRegister() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const invalidateQueries = jest.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: PropsWithChildren<{}>) => (
    <TestApiProvider
      apis={[
        [musterApiRef, musterApi],
        [analyticsApiRef, analyticsApi],
      ]}
    >
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </TestApiProvider>
  );
  return {
    ...renderHook(() => useRegisterMcpServer(), { wrapper }),
    invalidateQueries,
    /** What React Query keeps of every mutation after it settled. */
    keptVariables: () =>
      queryClient
        .getMutationCache()
        .getAll()
        .map(
          mutation =>
            mutation.state.variables as McpServerRegistration | undefined,
        ),
  };
}

/** `describe_tool` of a muster whose tools take a display name or not. */
function schemaWith(displayName: boolean) {
  return (name: string) =>
    Promise.resolve({
      name,
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          ...(displayName ? { displayName: { type: 'string' } } : {}),
        },
      },
    });
}

beforeEach(() => {
  callTool.mockReset();
  callTool.mockResolvedValue({});
  describeTool.mockReset();
  describeTool.mockImplementation(schemaWith(true));
  jest.mocked(analyticsApi.captureEvent).mockClear();
});

describe('useRegisterMcpServer', () => {
  describe('with client credentials', () => {
    const SECRET = 'hubspot-s3cret';
    const withClient: McpServerDefinition = {
      ...definition,
      auth: {
        type: 'oauth',
        authorizationServer: {
          issuer: 'https://app.hubspot.com',
          clientCredentialsSecretRef: { name: 'github-oauth-client-ab12c' },
        },
      },
    };
    const sentAuth = {
      type: 'oauth',
      authorizationServer: { issuer: 'https://app.hubspot.com' },
    };
    const clientCredentials = () =>
      new OneTimeClientCredentials({
        clientId: 'hubspot-client',
        clientSecret: SECRET,
      });

    it.each([
      [false, 'core_mcpserver_create'],
      [true, 'core_mcpserver_update'],
    ])(
      'sends them to the write only, without the old reference (isEdit %s)',
      async (isEdit, tool) => {
        const { result } = renderRegister();

        let sent: McpServerDefinition | undefined;
        await act(async () => {
          sent = await result.current.mutateAsync({
            ...registration,
            definition: withClient,
            isEdit,
            clientCredentials: clientCredentials(),
          });
        });

        expect(callTool.mock.calls).toEqual([
          [
            'core_mcpserver_validate',
            { ...definition, auth: sentAuth },
            'gazelle',
          ],
          [
            tool,
            {
              ...definition,
              auth: sentAuth,
              clientCredentials: {
                clientId: 'hubspot-client',
                clientSecret: SECRET,
              },
            },
            'gazelle',
          ],
        ]);
        // What the caller keeps as the base of later saves has no values.
        expect(sent).toEqual({ ...definition, auth: sentAuth });
      },
    );

    it('keeps them out of the analytics event and the mutation state', async () => {
      const { result, keptVariables } = renderRegister();

      await act(() =>
        result.current.mutateAsync({
          ...registration,
          definition: withClient,
          clientCredentials: clientCredentials(),
        }),
      );

      expect(analyticsApi.captureEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'Muster.mcpServerAdded',
          attributes: { authMode: 'own-account' },
        }),
      );
      expect(
        JSON.stringify(jest.mocked(analyticsApi.captureEvent).mock.calls),
      ).not.toContain(SECRET);
      // React Query keeps the variables after the call; the holder in them
      // is empty by then.
      const [kept] = keptVariables();
      expect(kept?.clientCredentials).toBeInstanceOf(OneTimeClientCredentials);
      expect(JSON.stringify(kept)).not.toContain(SECRET);
      expect(kept?.clientCredentials?.take()).toBeUndefined();
    });

    it('keeps them out of the error of a refused write', async () => {
      callTool.mockImplementation((tool: string) =>
        tool === 'core_mcpserver_create'
          ? Promise.reject(
              new Error('Permission denied: may not create Secret'),
            )
          : Promise.resolve({}),
      );
      const { result, keptVariables } = renderRegister();

      await act(() =>
        result.current
          .mutateAsync({
            ...registration,
            definition: withClient,
            clientCredentials: clientCredentials(),
          })
          .catch(() => undefined),
      );

      await waitFor(() =>
        expect(result.current.error?.message).toBe(
          'Permission denied: may not create Secret',
        ),
      );
      expect(
        JSON.stringify(
          result.current.error,
          Object.getOwnPropertyNames(result.current.error),
        ),
      ).not.toContain(SECRET);
      const [kept] = keptVariables();
      expect(kept?.clientCredentials?.take()).toBeUndefined();
      expect(analyticsApi.captureEvent).not.toHaveBeenCalled();
    });
  });

  it('validates, creates and reports the added server with its auth mode', async () => {
    const { result, invalidateQueries } = renderRegister();

    await act(() => result.current.mutateAsync(registration));

    expect(callTool.mock.calls).toEqual([
      ['core_mcpserver_validate', definition, 'gazelle'],
      ['core_mcpserver_create', definition, 'gazelle'],
    ]);
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['muster'] });
    expect(analyticsApi.captureEvent).toHaveBeenCalledTimes(1);
    expect(analyticsApi.captureEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'Muster.mcpServerAdded',
        attributes: { authMode: 'own-account' },
      }),
    );
  });

  it('updates in place within an Add run and reports nothing more', async () => {
    const { result } = renderRegister();

    await act(() =>
      result.current.mutateAsync({ ...registration, isEdit: true }),
    );

    expect(callTool).toHaveBeenLastCalledWith(
      'core_mcpserver_update',
      definition,
      'gazelle',
    );
    expect(analyticsApi.captureEvent).not.toHaveBeenCalled();
  });

  it("reports an update in a run started from the server's Edit as an edit", async () => {
    const { result } = renderRegister();

    await act(() =>
      result.current.mutateAsync({
        ...registration,
        isEdit: true,
        startedFromEdit: true,
      }),
    );

    expect(callTool).toHaveBeenLastCalledWith(
      'core_mcpserver_update',
      definition,
      'gazelle',
    );
    expect(analyticsApi.captureEvent).toHaveBeenCalledTimes(1);
    expect(analyticsApi.captureEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'Muster.mcpServerUpdated',
        attributes: {},
      }),
    );
  });

  it('sends the display name to a muster whose tool takes it', async () => {
    const named = { ...definition, displayName: 'GitHub' };
    const { result } = renderRegister();

    let sent: McpServerDefinition | undefined;
    await act(async () => {
      sent = await result.current.mutateAsync({
        ...registration,
        definition: named,
      });
    });

    expect(describeTool).toHaveBeenCalledWith(
      'core_mcpserver_create',
      'gazelle',
    );
    expect(callTool.mock.calls).toEqual([
      ['core_mcpserver_validate', named, 'gazelle'],
      ['core_mcpserver_create', named, 'gazelle'],
    ]);
    expect(sent).toEqual(named);
  });

  it('leaves the display name out where the tool does not declare it', async () => {
    describeTool.mockImplementation(schemaWith(false));
    const { result } = renderRegister();

    let sent: McpServerDefinition | undefined;
    await act(async () => {
      sent = await result.current.mutateAsync({
        ...registration,
        definition: { ...definition, displayName: '' },
        isEdit: true,
      });
    });

    expect(describeTool).toHaveBeenCalledWith(
      'core_mcpserver_update',
      'gazelle',
    );
    expect(callTool.mock.calls).toEqual([
      ['core_mcpserver_validate', definition, 'gazelle'],
      ['core_mcpserver_update', definition, 'gazelle'],
    ]);
    expect(sent).toEqual(definition);
  });

  it('checks each tool it calls on its own', async () => {
    // A muster whose validate does not declare the field refuses it there.
    describeTool.mockImplementation((name: string) =>
      schemaWith(name !== 'core_mcpserver_validate')(name),
    );
    const named = { ...definition, displayName: 'GitHub' };
    const { result } = renderRegister();

    await act(() =>
      result.current.mutateAsync({ ...registration, definition: named }),
    );

    expect(callTool.mock.calls).toEqual([
      ['core_mcpserver_validate', definition, 'gazelle'],
      ['core_mcpserver_create', named, 'gazelle'],
    ]);
  });

  it('saves nothing when a schema cannot be read, and says why, at once', async () => {
    describeTool.mockRejectedValue(new Error('upstream 502'));
    const { result } = renderRegister();

    let error: Error | undefined;
    await act(async () => {
      error = await result.current
        .mutateAsync({
          ...registration,
          definition: { ...definition, displayName: 'GitHub' },
        })
        .then(
          () => undefined,
          (e: Error) => e,
        );
    });

    expect(error?.message).toBe(
      "Muster could not be asked whether it keeps the connector's name (upstream 502). Nothing was saved; try again.",
    );
    expect(callTool).not.toHaveBeenCalled();
    // Not retried: one read per tool.
    expect(describeTool).toHaveBeenCalledTimes(2);
    expect(analyticsApi.captureEvent).not.toHaveBeenCalled();
  });

  it('asks for no schema when there is no display name to send', async () => {
    const { result } = renderRegister();

    await act(() => result.current.mutateAsync(registration));

    expect(describeTool).not.toHaveBeenCalled();
  });

  it('writes nothing and reports nothing when validation refuses', async () => {
    callTool.mockRejectedValueOnce(new Error('url: must be https'));
    const { result } = renderRegister();

    await act(() =>
      result.current.mutateAsync(registration).catch(() => undefined),
    );

    expect(callTool).toHaveBeenCalledTimes(1);
    expect(analyticsApi.captureEvent).not.toHaveBeenCalled();
  });
});
