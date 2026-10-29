import type { WorkflowStep } from './k8s';
import { fleetImageScanWorkflow } from './__fixtures__/fleetImageScan';
import { allSteps, workflowShape, workflowShapeLabel } from './workflowShape';

const tool = (id: string): WorkflowStep => ({ id, tool: `x_${id}` });
const loop = (id: string, steps: WorkflowStep[]): WorkflowStep => ({
  id,
  forEach: { items: '{{ .input.xs }}', steps },
});

describe('workflowShapeLabel', () => {
  it('counts a plain list of steps as steps', () => {
    expect(workflowShapeLabel([tool('a'), tool('b'), tool('c')])).toBe(
      '3 steps',
    );
    expect(workflowShapeLabel([tool('a')])).toBe('1 step');
    expect(workflowShapeLabel([])).toBe('0 steps');
  });

  it('counts the tool steps at every depth and names nested loops', () => {
    const fleet = fleetImageScanWorkflow().getSteps();
    expect(workflowShapeLabel(fleet)).toBe('8 tool steps in 2 nested loops');
    expect(workflowShape(fleet)).toEqual({
      toolSteps: 8,
      loops: 2,
      nestedLoops: 1,
      deepestLoops: 2,
      parallelGroups: 0,
      allGrouped: true,
    });
  });

  it('says "in" only when every tool step sits in a loop or group', () => {
    expect(
      workflowShapeLabel([tool('a'), loop('l', [tool('b'), tool('c')])]),
    ).toBe('3 tool steps, 1 loop');
    expect(workflowShapeLabel([loop('l', [tool('b')])])).toBe(
      '1 tool step in 1 loop',
    );
  });

  it('names parallel groups and loops side by side', () => {
    expect(
      workflowShapeLabel([
        loop('l', [tool('a'), tool('b')]),
        { id: 'p', parallel: [tool('c'), tool('d')] },
      ]),
    ).toBe('4 tool steps in 1 loop and 1 parallel group');
    expect(
      workflowShapeLabel([
        loop('one', [tool('a')]),
        loop('two', [loop('three', [tool('b')])]),
      ]),
    ).toBe('2 tool steps in 3 loops (1 nested)');
  });

  it('calls loops nested only when each sits inside the one before', () => {
    // Three deep: one nest.
    expect(
      workflowShapeLabel([loop('a', [loop('b', [loop('c', [tool('x')])])])]),
    ).toBe('1 tool step in 3 nested loops');
    // Two loops side by side in a third: not a three-deep nest.
    expect(
      workflowShapeLabel([
        loop('outer', [loop('left', [tool('x')]), loop('right', [tool('y')])]),
      ]),
    ).toBe('2 tool steps in 3 loops (2 nested)');
    // A loop in a parallel group is not inside another loop.
    expect(
      workflowShapeLabel([
        { id: 'p', parallel: [loop('l', [tool('x')]), tool('y')] },
      ]),
    ).toBe('2 tool steps in 1 loop and 1 parallel group');
  });
});

describe('allSteps', () => {
  it('lists every step at every depth, each group before what it holds', () => {
    expect(
      allSteps(fleetImageScanWorkflow().getSteps()).map(step => step.id),
    ).toEqual([
      'fleet',
      'clusters',
      'scan',
      'deployments',
      'replicasets',
      'statefulsets',
      'daemonsets',
      'cronjobs',
      'jobs',
      'pods',
    ]);
  });

  it('skips what is not a list of steps rather than failing on it', () => {
    expect(
      allSteps([
        { id: 'a', forEach: { items: 'x' } as never },
        { id: 'b', parallel: 'no' as never },
      ]).map(step => step.id),
    ).toEqual(['a', 'b']);
  });
});
