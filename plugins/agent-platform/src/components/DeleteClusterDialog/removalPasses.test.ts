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
      passOf([object('demo1', 'delete')]),
      passOf([object('demo1', 'delete'), object('demo1-apps', 'delete')]),
    ];

    expect(summarizePass(passes, 1)).toEqual({
      removed: [object('demo1-apps', 'delete')],
      stillGoing: [object('demo1', 'delete')],
      others: [],
      changed: [],
    });
    expect(summarizePass(passes, 0).removed).toHaveLength(1);
  });

  it('counts the past-tense deleted as a delete too', () => {
    const passes = [
      passOf([object('demo1', 'delete')]),
      passOf([object('demo1', 'deleted')]),
    ];

    expect(summarizePass(passes, 1)).toMatchObject({
      removed: [],
      stillGoing: [object('demo1', 'deleted')],
      others: [],
    });
  });

  it('keeps every other action, and tells what changed from what did not', () => {
    const passes = [
      passOf([
        object('a', 'update'),
        object('b', 'unchanged'),
        object('c', 'pending'),
      ]),
    ];

    const { removed, others, changed } = summarizePass(passes, 0);
    expect(removed).toEqual([]);
    expect(others.map(o => o.name)).toEqual(['a', 'b', 'c']);
    expect(changed.map(o => o.name)).toEqual(['a']);
  });

  it('tells objects of the same kind and name in other API groups apart', () => {
    const passes = [
      passOf([{ ...object('demo1', 'delete'), apiVersion: 'a.io/v1' }]),
      passOf([
        { ...object('demo1', 'delete'), apiVersion: 'a.io/v2' },
        { ...object('demo1', 'delete'), apiVersion: 'b.io/v1' },
      ]),
    ];

    const { removed, stillGoing } = summarizePass(passes, 1);
    expect(stillGoing.map(o => o.apiVersion)).toEqual(['a.io/v2']);
    expect(removed.map(o => o.apiVersion)).toEqual(['b.io/v1']);
  });
});

describe('judgeNextPass', () => {
  const passes = [
    passOf([object('demo1', 'delete')], {
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

  it('is ready when a pass would change anything else', () => {
    expect(
      judgeNextPass(result([object('demo1', 'would-update')]), passes),
    ).toEqual({ state: 'ready', objects: [object('demo1', 'would-update')] });
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
        passOf([object('demo1', 'delete')]),
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
