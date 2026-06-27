import { MusterWorkflow } from './k8s';
import { findReferencedBy } from './workflowReferences';

function makeWorkflow(
  name: string,
  steps: Array<Record<string, unknown>>,
  cluster = 'gazelle',
): MusterWorkflow {
  return new MusterWorkflow(
    {
      apiVersion: 'muster.giantswarm.io/v1alpha1',
      kind: 'Workflow',
      metadata: { name },
      spec: { steps },
    } as never,
    cluster,
  );
}

describe('findReferencedBy', () => {
  it('finds workflows that call the target via a top-level step', () => {
    const target = makeWorkflow('deploy', [{ id: 's1', tool: 'core_x' }]);
    const caller = makeWorkflow('release', [
      { id: 's1', tool: 'workflow_deploy' },
    ]);
    const unrelated = makeWorkflow('noop', [{ id: 's1', tool: 'core_y' }]);

    const result = findReferencedBy('deploy', [target, caller, unrelated]);

    expect(result.map(w => w.getName())).toEqual(['release']);
  });

  it('matches calls nested in parallel and forEach sub-steps', () => {
    const parallelCaller = makeWorkflow('fanout', [
      {
        id: 'p',
        parallel: [
          { id: 'a', tool: 'core_x' },
          { id: 'b', tool: 'workflow_deploy' },
        ],
      },
    ]);
    const loopCaller = makeWorkflow('loop', [
      {
        id: 'l',
        forEach: {
          items: '${clusters}',
          steps: [{ id: 'each', tool: 'workflow_deploy' }],
        },
      },
    ]);

    const result = findReferencedBy('deploy', [parallelCaller, loopCaller]);

    expect(result.map(w => w.getName()).sort()).toEqual(['fanout', 'loop']);
  });

  it('excludes the target itself even if it self-references', () => {
    const selfRef = makeWorkflow('deploy', [
      { id: 's1', tool: 'workflow_deploy' },
    ]);

    expect(findReferencedBy('deploy', [selfRef])).toEqual([]);
  });
});
