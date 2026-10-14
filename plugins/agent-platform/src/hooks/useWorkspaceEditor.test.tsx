import { PropsWithChildren } from 'react';
import { act, renderHook } from '@testing-library/react';
import { analyticsApiRef } from '@backstage/core-plugin-api';
import { mockApis, TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { MusterApi } from '@giantswarm/backstage-plugin-muster';

import { WorkspaceManagerClient } from '../apis/WorkspaceManagerClient';
import { emptySource, type WorkspaceDraft } from '../lib/workspaceDraft';
import { WorkspaceManagerError } from '../lib/workspaceManager';
import { useSaveWorkspace } from './useWorkspaceEditor';

const analyticsApi = mockApis.analytics.mock();
const callTool = jest.fn();
const client = new WorkspaceManagerClient(
  { callTool } as unknown as MusterApi,
  'lab',
);

const draft: WorkspaceDraft = {
  name: 'platform-mcp',
  sources: [{ ...emptySource('github'), owner: 'acme', languages: ['Go'] }],
  headroom: '',
  minimum: '',
};

function renderSave() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  const wrapper = ({ children }: PropsWithChildren<{}>) => (
    <TestApiProvider apis={[[analyticsApiRef, analyticsApi]]}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </TestApiProvider>
  );
  return renderHook(() => useSaveWorkspace(client), { wrapper });
}

beforeEach(() => {
  jest.mocked(analyticsApi.captureEvent).mockClear();
  callTool.mockReset();
  callTool.mockImplementation(async (_tool: string, args: any) => ({
    ...args,
    resourceVersion: '2',
  }));
});

describe('useSaveWorkspace', () => {
  it('creates the workspace as the person and reports it as created', async () => {
    const { result } = renderSave();
    await act(async () => {
      await result.current.mutateAsync({ draft, organization: 'acme' });
    });

    expect(callTool).toHaveBeenCalledWith(
      'x_workspace-manager_create_workspace',
      {
        name: 'platform-mcp',
        organization: 'acme',
        sources: [
          { provider: 'github', owner: 'acme', filters: { languages: ['Go'] } },
        ],
      },
      'lab',
    );
    expect(analyticsApi.captureEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'AgentPlatform.workspaceSaved',
        attributes: { kind: 'created' },
      }),
    );
  });

  it('updates against the version read and reports it as updated', async () => {
    const { result } = renderSave();
    await act(async () => {
      await result.current.mutateAsync({
        draft,
        organization: 'acme',
        edit: { resourceVersion: '7' },
      });
    });

    expect(callTool.mock.calls[0][0]).toBe(
      'x_workspace-manager_update_workspace',
    );
    expect(callTool.mock.calls[0][1]).toMatchObject({ resourceVersion: '7' });
    expect(analyticsApi.captureEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'AgentPlatform.workspaceSaved',
        attributes: { kind: 'updated' },
      }),
    );
  });

  it("surfaces the manager's refusal and reports nothing", async () => {
    callTool.mockRejectedValue(
      new Error(
        'create_workspace: invalid workspace: spec.sources[0].owner: Invalid value',
      ),
    );
    const { result } = renderSave();
    let error: unknown;
    await act(async () => {
      await result.current
        .mutateAsync({ draft, organization: 'acme' })
        .catch(cause => {
          error = cause;
        });
    });

    expect(error).toBeInstanceOf(WorkspaceManagerError);
    expect((error as WorkspaceManagerError).kind).toBe('invalid');
    expect(analyticsApi.captureEvent).not.toHaveBeenCalled();
  });
});
