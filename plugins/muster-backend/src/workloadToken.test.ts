import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mockServices } from '@backstage/backend-test-utils';
import {
  DEFAULT_WORKLOAD_TOKEN_FILE,
  MUSTER_CLIENT_WORKLOAD_HEADER,
  workloadHeaders,
  workloadTokenSource,
} from './workloadToken';

describe('workloadTokenSource', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'muster-workload-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const source = (file?: string) => {
    const logger = mockServices.logger.mock();
    const config = mockServices.rootConfig({
      data: file ? { muster: { workloadTokenFile: file } } : {},
    });
    return { read: workloadTokenSource(config, logger), logger };
  };

  it('reads the token from the configured file on every call, as it rotates', async () => {
    const file = join(dir, 'token');
    await writeFile(file, 'first\n');
    const { read, logger } = source(file);

    await expect(read()).resolves.toBe('first');
    await writeFile(file, 'second');
    await expect(read()).resolves.toBe('second');
    expect(JSON.stringify((logger.info as jest.Mock).mock.calls)).not.toMatch(
      /first|second/,
    );
  });

  it('answers no token without the file, and says so once', async () => {
    const { read, logger } = source(join(dir, 'missing'));

    await expect(read()).resolves.toBeUndefined();
    await expect(read()).resolves.toBeUndefined();
    expect(logger.info).toHaveBeenCalledTimes(1);
  });

  it('defaults to the file the chart projects', () => {
    expect(DEFAULT_WORKLOAD_TOKEN_FILE).toBe(
      '/var/run/secrets/muster.giantswarm.io/serviceaccount/token',
    );
  });

  it('adds the header only with a token', () => {
    expect(workloadHeaders('t')).toEqual({
      [MUSTER_CLIENT_WORKLOAD_HEADER]: 't',
    });
    expect(workloadHeaders(undefined)).toEqual({});
  });
});
