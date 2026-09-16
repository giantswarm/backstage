import { Pod, PodInterface } from './Pod';

function makePod(status: PodInterface['status']): Pod {
  return new Pod(
    {
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: { name: 'qwen3-14b-predictor-abc', namespace: 'kserve' },
      spec: { containers: [{ name: 'kserve-container' }] },
      status,
    } as PodInterface,
    'installation-1',
  );
}

describe('Pod', () => {
  describe('getPendingState', () => {
    it('is the first waiting container’s reason, init containers first', () => {
      expect(
        makePod({
          phase: 'Pending',
          conditions: [{ type: 'PodScheduled', status: 'True' }],
          initContainerStatuses: [
            {
              name: 'storage-initializer',
              state: {
                waiting: {
                  reason: 'ImagePullBackOff',
                  message:
                    'Back-off pulling image "kserve/storage-initializer"',
                },
              },
            },
          ],
          containerStatuses: [
            {
              name: 'kserve-container',
              state: { waiting: { reason: 'PodInitializing' } },
            },
          ],
        }).getPendingState(),
      ).toEqual({
        reason: 'ImagePullBackOff',
        message: 'Back-off pulling image "kserve/storage-initializer"',
      });
    });

    it('is the scheduler’s verdict when no container waits yet', () => {
      expect(
        makePod({
          phase: 'Pending',
          conditions: [
            {
              type: 'PodScheduled',
              status: 'False',
              reason: 'Unschedulable',
              message:
                '0/3 nodes are available: 3 Insufficient nvidia.com/gpu.',
            },
          ],
        }).getPendingState(),
      ).toEqual({
        reason: 'Unschedulable',
        message: '0/3 nodes are available: 3 Insufficient nvidia.com/gpu.',
      });
    });

    it('falls back to the pod’s own status reason, and says nothing without one', () => {
      expect(
        makePod({
          phase: 'Pending',
          reason: 'NodeAffinity',
          message: 'Pod was rejected',
        }).getPendingState(),
      ).toEqual({ reason: 'NodeAffinity', message: 'Pod was rejected' });
      expect(makePod({ phase: 'Pending' }).getPendingState()).toBeUndefined();
      expect(
        makePod({
          phase: 'Pending',
          conditions: [{ type: 'PodScheduled', status: 'False' }],
        }).getPendingState(),
      ).toBeUndefined();
    });

    it('is undefined for a pod in any other phase', () => {
      expect(
        makePod({
          phase: 'Running',
          containerStatuses: [
            {
              name: 'kserve-container',
              state: { waiting: { reason: 'CrashLoopBackOff' } },
            },
          ],
        }).getPendingState(),
      ).toBeUndefined();
      expect(makePod(undefined).getPendingState()).toBeUndefined();
    });
  });
});
