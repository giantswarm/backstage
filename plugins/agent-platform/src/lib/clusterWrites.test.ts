import {
  ClusterManagerError,
  ClusterManagerNotConnectedError,
  type ClusterWriteResult,
  type WriteMode,
} from './clusterManager';
import {
  COMMIT_NOT_OFFERED,
  judgeModes,
  modeBlocker,
  notConnectedOf,
  preferredMode,
} from './clusterWrites';

const RESULT: ClusterWriteResult = {
  cluster: 'wc1',
  namespace: 'org-acme',
  pool: '',
  mode: 'apply',
  dryRun: true,
  objects: [],
};

const answering =
  (refusals: Partial<Record<WriteMode, Error>>) => async (mode: WriteMode) => {
    const refusal = refusals[mode];
    if (refusal) {
      throw refusal;
    }
    return { ...RESULT, mode };
  };

describe('judgeModes', () => {
  it('prefers Commit where its dry run passes', async () => {
    const verdicts = await judgeModes(answering({}), true);
    expect(verdicts.apply.state).toBe('ready');
    expect(verdicts.commit.state).toBe('ready');
    expect(preferredMode(verdicts)).toBe('commit');
    expect(modeBlocker(verdicts.commit)).toBeUndefined();
  });

  it('falls back to Deploy with the commit refusal as the reason', async () => {
    const dryRun = jest.fn(
      answering({
        commit: new ClusterManagerError(
          'Organization acme: no Flux Kustomization reconciles it',
        ),
      }),
    );
    const verdicts = await judgeModes(dryRun, true);
    expect(preferredMode(verdicts)).toBe('apply');
    expect(modeBlocker(verdicts.commit)).toBe(
      'Organization acme: no Flux Kustomization reconciles it',
    );
    expect(dryRun).toHaveBeenCalledTimes(2);
  });

  it('never calls mode commit where the installation does not offer it', async () => {
    const dryRun = jest.fn(answering({}));
    const verdicts = await judgeModes(dryRun, false);
    expect(dryRun).toHaveBeenCalledTimes(1);
    expect(dryRun).toHaveBeenCalledWith('apply');
    expect(modeBlocker(verdicts.commit)).toBe(COMMIT_NOT_OFFERED);
    expect(preferredMode(verdicts)).toBe('apply');
  });

  it('prefers nothing when both modes refuse', async () => {
    const verdicts = await judgeModes(
      answering({
        apply: new ClusterManagerError('the installation’s own cluster'),
        commit: new ClusterManagerError('not in the repository'),
      }),
      true,
    );
    expect(preferredMode(verdicts)).toBeUndefined();
  });

  it('names a "not connected" answer for the connect step', async () => {
    const verdicts = await judgeModes(
      answering({
        apply: new ClusterManagerNotConnectedError('not connected'),
        commit: new ClusterManagerNotConnectedError('not connected'),
      }),
      true,
    );
    expect(notConnectedOf(verdicts)?.kind).toBe('not-connected');
    expect(notConnectedOf(undefined)).toBeUndefined();
  });
});
