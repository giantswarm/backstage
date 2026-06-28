import { MusterWorkflow } from './k8s';
import {
  isGitOpsManaged,
  toManifestYaml,
  toWorkflowDefinition,
} from './gitops';

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
        namespace: 'agentic-platform',
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

describe('workflow provenance (gitops.ts)', () => {
  it('treats a Flux HelmRelease-labelled workflow as GitOps-managed', () => {
    const managed = makeWorkflow({
      metadata: {
        name: 'deploy',
        labels: { 'helm.toolkit.fluxcd.io/name': 'agentic-platform' },
      },
    });
    expect(isGitOpsManaged(managed)).toBe(true);
  });

  it('treats a workflow with no Flux/Helm markers as ad-hoc (live CRUD)', () => {
    expect(isGitOpsManaged(makeWorkflow())).toBe(false);
  });

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
