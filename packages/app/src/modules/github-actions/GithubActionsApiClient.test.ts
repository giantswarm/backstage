import {
  MusterGithubActionsClient,
  MusterServerNotConnectedError,
} from './GithubActionsApiClient';

describe('MusterGithubActionsClient', () => {
  const fetchMock = jest.fn();
  const client = new MusterGithubActionsClient({
    discoveryApi: {
      getBaseUrl: async () => 'http://portal/api/github-actions',
    },
    fetchApi: { fetch: fetchMock },
    tokenSource: { getToken: async () => 'dex-id-token' },
  });

  const jsonResponse = (body: unknown, status = 200) =>
    ({
      ok: status < 400,
      status,
      statusText: 'x',
      json: async () => body,
      text: async () => JSON.stringify(body),
    }) as unknown as Response;

  beforeEach(() => fetchMock.mockReset());

  it('forwards the muster token and builds the runs query', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ total_count: 0, workflow_runs: [] }),
    );
    const data = await client.listWorkflowRuns({
      owner: 'giantswarm',
      repo: 'agent-platform',
      pageSize: 5,
      page: 2,
      branch: 'main',
    });
    expect(data).toEqual({ total_count: 0, workflow_runs: [] });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://portal/api/github-actions/repos/giantswarm/agent-platform/runs?pageSize=5&page=2&branch=main',
      expect.objectContaining({
        headers: { 'backstage-muster-authorization': 'dex-id-token' },
      }),
    );
  });

  it('returns the default branch and job logs as text', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ default_branch: 'main' }));
    await expect(
      client.getDefaultBranch({ owner: 'giantswarm', repo: 'agent-platform' }),
    ).resolves.toBe('main');
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => 'line 1\nline 2\n',
    } as unknown as Response);
    await expect(
      client.downloadJobLogsForWorkflowRun({
        owner: 'giantswarm',
        repo: 'agent-platform',
        runId: 101,
      }),
    ).resolves.toBe('line 1\nline 2\n');
    expect(fetchMock).toHaveBeenLastCalledWith(
      'http://portal/api/github-actions/repos/giantswarm/agent-platform/jobs/101/logs',
      expect.anything(),
    );
  });

  it('re-runs with POST', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ run_id: 1 }, 201));
    await client.reRunWorkflow({ owner: 'o', repo: 'r', runId: 1 });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://portal/api/github-actions/repos/o/r/runs/1/rerun',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('turns the 401 with a sign-in URL into MusterServerNotConnectedError', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          error: {
            name: 'MusterServerNotConnectedError',
            message: "Connect 'github-actions' in muster to use this page.",
            server: 'github-actions',
            authUrl: 'https://muster.example/oauth/proxy/start?state=z',
          },
        },
        401,
      ),
    );
    const error = await client
      .getWorkflowRun({ owner: 'o', repo: 'r', id: 1 })
      .catch(e => e);
    expect(error).toBeInstanceOf(MusterServerNotConnectedError);
    expect(error.authUrl).toBe(
      'https://muster.example/oauth/proxy/start?state=z',
    );
    expect(error.server).toBe('github-actions');
  });

  it('refuses hosts other than github.com before calling the backend', async () => {
    await expect(
      client.listBranches({
        hostname: 'ghe.example.com',
        owner: 'o',
        repo: 'r',
      }),
    ).rejects.toThrow(/github\.com only/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
