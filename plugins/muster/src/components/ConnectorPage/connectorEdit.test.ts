import { MCPServer } from '../../lib/k8s';
import { ServerPageRow } from '../../lib/serverGrouping';
import {
  connectorEditBlock,
  GITOPS_EDIT_REASON,
  GITOPS_FAMILY_EDIT_REASON,
  INSTANCES_EDIT_REASON,
  SESSION_EDIT_REASON,
} from './connectorEdit';

const HELM = { 'app.kubernetes.io/managed-by': 'Helm' };

function server(
  name: string,
  {
    labels,
    spec,
  }: { labels?: Record<string, string>; spec?: Record<string, unknown> } = {},
): MCPServer {
  return new MCPServer(
    {
      apiVersion: 'muster.giantswarm.io/v1alpha1',
      kind: 'MCPServer',
      metadata: { name, namespace: 'muster', labels },
      spec: {
        type: 'streamable-http',
        url: `https://${name}.example.test/mcp`,
        ...spec,
      },
    } as never,
    'gazelle',
  );
}

describe('connectorEditBlock', () => {
  it('lets the wizard edit a portal-added server over a live session', () => {
    expect(
      connectorEditBlock({ kind: 'server', server: server('jira') }, true),
    ).toBeUndefined();
  });

  it('names GitOps for a server applied from Git, session or not', () => {
    const gitOps = {
      kind: 'server',
      server: server('grafana', { labels: HELM }),
    } as const;
    expect(connectorEditBlock(gitOps, true)).toEqual({
      cause: 'gitops',
      reason: GITOPS_EDIT_REASON,
    });
    expect(connectorEditBlock(gitOps, false)?.cause).toBe('gitops');
  });

  it('needs the muster session the save runs through', () => {
    expect(
      connectorEditBlock({ kind: 'server', server: server('jira') }, false),
    ).toEqual({ cause: 'session', reason: SESSION_EDIT_REASON });
  });

  it('points a server the wizard cannot represent to Edit as JSON', () => {
    const block = connectorEditBlock(
      { kind: 'server', server: server('local', { spec: { type: 'stdio' } }) },
      true,
    );
    expect(block?.cause).toBe('wizard');
    expect(block?.reason).toMatch(/Edit as JSON/);
  });

  it('does not edit a family from its page, naming GitOps where it applies', () => {
    const family = (labels?: Record<string, string>): ServerPageRow => ({
      kind: 'family',
      family: 'kubernetes',
      servers: [server('a-kubernetes', { labels }), server('b-kubernetes')],
    });
    expect(connectorEditBlock(family(HELM), true)).toEqual({
      cause: 'gitops',
      reason: GITOPS_FAMILY_EDIT_REASON,
    });
    expect(connectorEditBlock(family(), true)).toEqual({
      cause: 'instances',
      reason: INSTANCES_EDIT_REASON,
    });
  });

  it('has nothing to say about muster itself, which has no Edit', () => {
    expect(connectorEditBlock({ kind: 'core' }, true)).toBeUndefined();
  });
});
