import { MusterWorkflow } from './k8s';
import { toManifestYaml, toWorkflowDefinition } from './gitops';

function makeWorkflow(
  overrides: Record<string, unknown> = {},
  cluster = 'gazelle',
): MusterWorkflow {
  return new MusterWorkflow(
    {
      apiVersion: 'muster.giantswarm.io/v1alpha1',
      kind: 'Workflow',
      metadata: {
        name: 'deploy',
        namespace: 'agent-platform',
        ...(overrides.metadata as object),
      },
      spec: (overrides.spec as object) ?? {
        description: 'Deploys things',
        args: { cluster: { type: 'string', required: true } },
        steps: [{ id: 's1', tool: 'core_service_list', args: {} }],
      },
    } as never,
    cluster,
  );
}

// Provenance detection itself is tested where it lives, in
// kubernetes-react's `provenance.test.ts`.
describe('workflow definitions (gitops.ts)', () => {
  it('flattens the spec into the core_workflow_* argument shape', () => {
    const def = toWorkflowDefinition(makeWorkflow());
    expect(def).toEqual({
      name: 'deploy',
      description: 'Deploys things',
      args: { cluster: { type: 'string', required: true } },
      steps: [{ id: 's1', tool: 'core_service_list', args: {} }],
    });
  });

  it('renders a Workflow manifest (kind/apiVersion from the object)', () => {
    const yaml = toManifestYaml(makeWorkflow());
    expect(yaml).toContain('kind: Workflow');
    expect(yaml).toContain('apiVersion: muster.giantswarm.io/v1alpha1');
    expect(yaml).toContain('name: deploy');
  });
});
