import { act, renderHook } from '@testing-library/react';
import jobsFixture from '../lib/__fixtures__/model-manager.jobs.json';
import kserveJobsFixture from '../lib/__fixtures__/model-manager.jobs.kserve.json';
import {
  modelManagerJobSchema,
  parseModelManagerList,
} from '../lib/modelManager';
import {
  DISMISSED_DOWNLOADS_STORAGE_KEY,
  downloadKey,
  downloadRowsFor,
  toDownloadRow,
  useDismissedDownloads,
  useDownloadRows,
  withDownloadRows,
} from './useDownloadRows';
import type { PullJob, PullJobs } from './usePullJobs';

const mockUsePullJobs = jest.fn<PullJobs, [string[]]>();
jest.mock('./usePullJobs', () => ({
  usePullJobs: (installations: string[]) => mockUsePullJobs(installations),
}));

const [succeeded] = parseModelManagerList(
  jobsFixture,
  'jobs',
  modelManagerJobSchema,
).map(job => ({ ...job, installation: 'lab' }));

const running: PullJob = {
  ...succeeded,
  id: 'running-1',
  model: 'qwen2.5:1.5b',
  phase: 'running',
  status: 'pulling 6f7f…',
  bytesCompleted: 120_000_000,
  bytesTotal: 400_000_000,
  percent: 30,
  result: undefined,
  wire: false,
};

const failed: PullJob = {
  ...running,
  id: 'failed-1',
  model: 'nope:latest',
  phase: 'failed',
  status: undefined,
  error: 'pull model manifest: file does not exist',
  bytesCompleted: 0,
  bytesTotal: 0,
  percent: 0,
  wire: true,
};

const backends = { lab: 'ollama' as const, gpu: 'kserve' as const };

beforeEach(() => {
  mockUsePullJobs.mockReset();
  window.sessionStorage.clear();
});

describe('toDownloadRow', () => {
  it('turns a running pull into a Downloading row named after the pulled reference, in the backend group', () => {
    const row = toDownloadRow(running, 'ollama');

    expect(row).toMatchObject({
      kind: 'download',
      id: 'lab/ollama/download/running-1',
      installation: 'lab',
      backend: 'ollama',
      name: 'qwen2.5:1.5b',
      readiness: 'downloading',
      readinessMessage: 'Being pulled onto the backend.',
      operable: false,
      usedBy: [],
      endpointHosts: [],
      download: {
        jobId: 'running-1',
        phase: 'running',
        status: 'pulling 6f7f…',
        bytesCompleted: 120_000_000,
        bytesTotal: 400_000_000,
        percent: 30,
        wire: false,
      },
    });
    expect(row.node).toBeUndefined();
    // Nothing a served model would show: no size under the name, no memory line.
    expect(row.sizeBytes).toBeUndefined();
    expect(row.loaded).toBeUndefined();
  });

  it('says the model config follows when the pull wires, and carries the node and preset when the job names them', () => {
    const row = toDownloadRow(
      {
        ...running,
        wire: true,
        node: 'gpu-node-1',
        preset: 'qwen3-14b',
        installation: 'gpu',
      },
      'kserve',
    );

    expect(row.readinessMessage).toBe(
      'Being pulled onto the backend; its model config is created once the pull completes.',
    );
    expect(row.node).toBe('gpu-node-1');
    expect(row.preset).toBe('qwen3-14b');
    expect(row.backend).toBe('kserve');
    expect(row.id).toBe('gpu/kserve/download/running-1');
  });

  it('carries neither node nor preset for a job that names none (Ollama)', () => {
    const row = toDownloadRow(running, 'ollama');

    expect(row.node).toBeUndefined();
    expect(row.preset).toBeUndefined();
  });

  it('reads node and preset off a kserve job as model-manager reports them', () => {
    const [kserveJob] = parseModelManagerList(
      kserveJobsFixture,
      'jobs',
      modelManagerJobSchema,
    );
    const row = toDownloadRow({ ...kserveJob, installation: 'gpu' }, 'kserve');

    expect(row).toMatchObject({
      name: 'hf-internal-testing/tiny-random-gpt2',
      node: 'agentlab-control-plane',
      preset: 'tiny-random-gpt2',
      readiness: 'downloading',
    });
  });

  it('turns a failed pull into a Not ready row carrying the failure', () => {
    const row = toDownloadRow(failed, 'ollama');

    expect(row.readiness).toBe('notReady');
    expect(row.readinessMessage).toBe(
      'The pull failed: pull model manifest: file does not exist',
    );
    expect(row.download).toMatchObject({
      phase: 'failed',
      error: 'pull model manifest: file does not exist',
      wire: true,
    });
    expect(
      toDownloadRow({ ...failed, error: undefined }, 'ollama'),
    ).toMatchObject({
      readinessMessage: 'The pull failed.',
    });
  });
});

describe('downloadRowsFor', () => {
  it('keeps pulls in flight and undismissed failures; drops finished, cancelled and load jobs', () => {
    const pending: PullJob = { ...running, id: 'pending-1', phase: 'pending' };
    const cancelled: PullJob = {
      ...running,
      id: 'cancelled-1',
      phase: 'cancelled',
    };
    const load: PullJob = { ...running, id: 'load-1', type: 'load' };

    const rows = downloadRowsFor(
      [succeeded, running, pending, cancelled, failed, load],
      backends,
    );

    expect(rows.map(row => row.download.jobId)).toEqual([
      'running-1',
      'pending-1',
      'failed-1',
    ]);
  });

  it('hides a dismissed failure but never an active pull, and skips an installation without a backend', () => {
    const elsewhere: PullJob = {
      ...running,
      id: 'elsewhere-1',
      installation: 'nowhere',
    };

    const rows = downloadRowsFor(
      [running, failed, elsewhere],
      backends,
      new Set([downloadKey(failed), downloadKey(running)]),
    );

    expect(rows.map(row => row.download.jobId)).toEqual(['running-1']);
  });
});

describe('useDismissedDownloads', () => {
  it('remembers dismissals per tab', () => {
    const { result } = renderHook(() => useDismissedDownloads());
    expect(result.current[0].size).toBe(0);

    act(() => result.current[1](failed));

    expect(result.current[0].has('lab/failed-1')).toBe(true);
    expect(
      JSON.parse(
        window.sessionStorage.getItem(DISMISSED_DOWNLOADS_STORAGE_KEY) ?? '[]',
      ),
    ).toEqual(['lab/failed-1']);

    // A fresh mount reads them back.
    const { result: again } = renderHook(() => useDismissedDownloads());
    expect(again.current[0].has('lab/failed-1')).toBe(true);
  });

  it('starts clean when the storage holds nonsense', () => {
    window.sessionStorage.setItem(DISMISSED_DOWNLOADS_STORAGE_KEY, '{not json');
    const { result } = renderHook(() => useDismissedDownloads());
    expect(result.current[0].size).toBe(0);
  });
});

describe('useDownloadRows', () => {
  it('asks for the jobs of the given installations and maps them to rows', () => {
    mockUsePullJobs.mockReturnValue({
      jobs: [running, failed, succeeded],
      isLoading: false,
      errors: [],
    });

    const { result } = renderHook(() => useDownloadRows(['lab'], backends));

    expect(mockUsePullJobs).toHaveBeenCalledWith(['lab']);
    expect(result.current.rows.map(row => row.name)).toEqual([
      'qwen2.5:1.5b',
      'nope:latest',
    ]);
    expect(result.current.errors).toEqual([]);
  });

  it('takes a dismissed failure off the rows and keeps it off', () => {
    mockUsePullJobs.mockReturnValue({
      jobs: [running, failed],
      isLoading: false,
      errors: [],
    });

    const { result, rerender } = renderHook(() =>
      useDownloadRows(['lab'], backends),
    );
    const failedRow = result.current.rows.find(
      row => row.download.phase === 'failed',
    )!;

    act(() => result.current.dismiss(failedRow));

    expect(result.current.rows.map(row => row.name)).toEqual(['qwen2.5:1.5b']);
    rerender();
    expect(result.current.rows.map(row => row.name)).toEqual(['qwen2.5:1.5b']);
  });

  it('forgets a dismissal once model-manager has forgotten the job', () => {
    window.sessionStorage.setItem(
      DISMISSED_DOWNLOADS_STORAGE_KEY,
      JSON.stringify(['lab/long-gone', downloadKey(failed)]),
    );
    mockUsePullJobs.mockReturnValue({
      jobs: [failed],
      isLoading: false,
      errors: [],
    });

    renderHook(() => useDownloadRows(['lab'], backends));

    expect(
      JSON.parse(
        window.sessionStorage.getItem(DISMISSED_DOWNLOADS_STORAGE_KEY) ?? '[]',
      ),
    ).toEqual(['lab/failed-1']);
  });

  it('passes on the installations whose job list could not be read', () => {
    const error = new Error('502 from the gateway');
    mockUsePullJobs.mockReturnValue({
      jobs: [],
      isLoading: false,
      errors: [{ installation: 'lab', error }],
    });

    const { result } = renderHook(() => useDownloadRows(['lab'], backends));

    expect(result.current.rows).toEqual([]);
    expect(result.current.errors).toEqual([{ installation: 'lab', error }]);
  });
});

describe('withDownloadRows', () => {
  it('appends the downloads to the served rows and returns the same array when there are none', () => {
    const served = [toDownloadRow(running, 'ollama')];
    expect(withDownloadRows(served, [])).toBe(served);
    const download = toDownloadRow(failed, 'ollama');
    expect(withDownloadRows(served, [download])).toEqual([...served, download]);
  });
});
