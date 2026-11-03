import type {
  ClusterWriteResult,
  ObjectAction,
} from '../../lib/clusterManager';
import {
  judgeNextPass,
  summarizePass,
  type RemovalPass,
} from './removalPasses';

function object(name: string, action: string): ObjectAction {
  return {
    apiVersion: 'helm.toolkit.fluxcd.io/v2',
    kind: 'HelmRelease',
    name,
    namespace: 'org-acme',
    action,
  };
}

function result(
  objects: ObjectAction[],
  extra: Partial<ClusterWriteResult> = {},
): ClusterWriteResult {
  return {
    cluster: 'demo1',
    namespace: 'org-acme',
    pool: '',
    mode: 'apply',
    dryRun: false,
    objects,
    ...extra,
  };
}

function passOf(
  objects: ObjectAction[],
  extra: Partial<ClusterWriteResult> = {},
): RemovalPass {
  return { label: 'Delete', result: result(objects, extra), at: new Date() };
}

describe('summarizePass', () => {
  it('tells objects removed anew from those an earlier pass deleted already', () => {
    const passes = [
      passOf([object('demo1', 'deleted')]),
      passOf([object('demo1', 'deleted'), object('demo1-apps', 'deleted')]),
    ];

    expect(summarizePass(passes, 1)).toEqual({
      removed: [object('demo1-apps', 'deleted')],
      stillGoing: [object('demo1', 'deleted')],
    });
    expect(summarizePass(passes, 0).removed).toHaveLength(1);
  });
});

describe('judgeNextPass', () => {
  const passes = [
    passOf([object('demo1', 'deleted')], {
      nextStep: 'wait for the uninstall',
    }),
  ];

  it('is ready when a pass would delete an object no pass has deleted', () => {
    expect(
      judgeNextPass(
        result([object('demo1', 'would-delete'), object('x', 'would-delete')]),
        passes,
      ),
    ).toEqual({ state: 'ready', objects: [object('x', 'would-delete')] });
  });

  it("waits with cluster-manager's next step when nothing new would go", () => {
    expect(
      judgeNextPass(
        result([], { nextStep: 'cluster is being removed' }),
        passes,
      ),
    ).toEqual({ state: 'waiting', reason: 'cluster is being removed' });
    // Only the release again, without a step of its own: the last pass's.
    expect(
      judgeNextPass(result([object('demo1', 'would-delete')]), passes),
    ).toEqual({ state: 'waiting', reason: 'wait for the uninstall' });
    expect(
      judgeNextPass(result([object('demo1', 'would-delete')]), [
        passOf([object('demo1', 'deleted')]),
      ]),
    ).toEqual({
      state: 'waiting',
      reason: '1 object is still being removed: HelmRelease org-acme/demo1.',
    });
  });

  it("is stuck when what is left is not cluster-manager's to remove", () => {
    expect(
      judgeNextPass(result([], { warnings: ['someone else owns it'] }), passes),
    ).toEqual({ state: 'stuck', warnings: ['someone else owns it'] });
  });
});
