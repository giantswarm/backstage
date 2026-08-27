import { MCPServer, MusterWorkflow } from './k8s';
import {
  toManifestYaml,
  toMcpServerDefinition,
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

function makeMcpServer(spec: Record<string, unknown>): MCPServer {
  return new MCPServer(
    {
      apiVersion: 'muster.giantswarm.io/v1alpha1',
      kind: 'MCPServer',
      metadata: { name: 'aws-root', namespace: 'agent-platform' },
      spec,
    } as never,
    'gazelle',
  );
}

describe('MCP server definitions (gitops.ts)', () => {
  // The ad-hoc edit dialog seeds itself from this and saves the result, so a
  // field missing here is a field silently dropped from an existing server.
  it('carries the sigv4 block and request metadata through a round trip', () => {
    const spec = {
      type: 'streamable-http',
      url: 'https://aws-mcp.eu-central-1.api.aws/mcp',
      autoStart: true,
      timeout: 120,
      auth: {
        type: 'sigv4',
        sigv4: {
          region: 'eu-central-1',
          roleArn: 'arn:aws:iam::123456789012:role/muster-mcp',
        },
      },
      meta: { AWS_REGION: 'eu-central-1' },
    };

    expect(toMcpServerDefinition(makeMcpServer(spec))).toEqual({
      name: 'aws-root',
      ...spec,
    });
  });
});

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
