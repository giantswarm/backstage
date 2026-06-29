import { MusterWorkflow } from './MusterWorkflow';

function makeWorkflow(
  status: Record<string, unknown> | undefined,
  name = 'wf',
): MusterWorkflow {
  return new MusterWorkflow(
    {
      apiVersion: 'muster.giantswarm.io/v1alpha1',
      kind: 'Workflow',
      metadata: { name },
      spec: { steps: [{ id: 'probe', parallel: [{ id: 'a', tool: 't' }] }] },
      ...(status ? { status } : {}),
    } as never,
    'gazelle',
  );
}

describe('MusterWorkflow runnable vs valid (D2 decoupling)', () => {
  it('a validator-invalid workflow is still runnable and reads a warning', () => {
    const wf = makeWorkflow({
      valid: false,
      validationErrors: ["step 'probe': tool is required"],
    });
    expect(wf.isValid()).toBe(false);
    expect(wf.isRunnable()).toBe(true);
    expect(wf.hasValidationWarning()).toBe(true);
    expect(wf.getValidationErrors()).toEqual([
      "step 'probe': tool is required",
    ]);
  });

  it('a valid workflow is runnable with no validation warning', () => {
    const wf = makeWorkflow({ valid: true });
    expect(wf.isValid()).toBe(true);
    expect(wf.isRunnable()).toBe(true);
    expect(wf.hasValidationWarning()).toBe(false);
  });

  it('treats a missing status as runnable but warns (valid defaults false)', () => {
    const wf = makeWorkflow(undefined);
    expect(wf.isValid()).toBe(false);
    expect(wf.isRunnable()).toBe(true);
    expect(wf.hasValidationWarning()).toBe(true);
  });
});
