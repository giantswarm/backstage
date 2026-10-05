import { MCPServer } from './k8s';
import {
  serverPageResolver,
  serverPrefixInfos,
  shortToolName,
  toolsForRow,
} from './toolGrouping';

const tool = (name: string) => ({ name });

function mcpServer(
  name: string,
  spec: { family?: string; toolPrefix?: string } = {},
): MCPServer {
  return new MCPServer(
    {
      apiVersion: 'muster.giantswarm.io/v1alpha1',
      kind: 'MCPServer',
      metadata: { name },
      spec: {
        ...(spec.family
          ? { family: { name: spec.family, instanceArg: 'management_cluster' } }
          : {}),
        ...(spec.toolPrefix ? { toolPrefix: spec.toolPrefix } : {}),
      },
    } as never,
    'gazelle',
  );
}

describe('toolsForRow', () => {
  const walrus = mcpServer('walrus-mcp-kubernetes', { family: 'kubernetes' });
  const gazelle = mcpServer('gazelle-mcp-kubernetes', { family: 'kubernetes' });
  const foo = mcpServer('foo');
  const fooBar = mcpServer('foo_bar');
  const all = [walrus, gazelle, foo, fooBar];
  const prefixes = serverPrefixInfos(all);
  const names = (tools: { name: string }[]) => tools.map(t => t.name);

  const catalogue = [
    tool('x_kubernetes_get_pods'),
    // muster's per-instance fallback for a tool the instances disagree on.
    tool('x_walrus-mcp-kubernetes_describe'),
    tool('x_foo_list'),
    tool('x_foo_bar_list'),
    tool('core_workflow_list'),
    tool('workflow_deploy'),
  ];

  it('gives a family its grouped tools and its instances’ own ones', () => {
    expect(
      names(
        toolsForRow(
          catalogue,
          { kind: 'family', family: 'kubernetes', servers: [walrus, gazelle] },
          prefixes,
        ),
      ),
    ).toEqual(['x_kubernetes_get_pods', 'x_walrus-mcp-kubernetes_describe']);
  });

  it('attributes a tool to the longest matching prefix', () => {
    expect(
      names(toolsForRow(catalogue, { kind: 'server', server: foo }, prefixes)),
    ).toEqual(['x_foo_list']);
    expect(
      names(
        toolsForRow(catalogue, { kind: 'server', server: fooBar }, prefixes),
      ),
    ).toEqual(['x_foo_bar_list']);
  });

  it('gives muster its core and workflow tools', () => {
    expect(names(toolsForRow(catalogue, { kind: 'core' }, prefixes))).toEqual([
      'core_workflow_list',
      'workflow_deploy',
    ]);
  });

  it('uses a toolPrefix where the CR sets one', () => {
    const prefixed = mcpServer('aws-root', { toolPrefix: 'aws' });
    expect(
      names(
        toolsForRow(
          [tool('x_aws_list_buckets'), tool('x_aws-root_list_buckets')],
          { kind: 'server', server: prefixed },
          serverPrefixInfos([prefixed]),
        ),
      ),
    ).toEqual(['x_aws_list_buckets']);
  });

  it('lists a tool tied between a family and a same-named server on the family only', () => {
    const family = mcpServer('walrus-mcp-kubernetes', { family: 'kubernetes' });
    const singular = mcpServer('kubernetes');
    const tied = serverPrefixInfos([family, singular]);
    const pods = [tool('x_kubernetes_get_pods')];
    expect(
      names(
        toolsForRow(
          pods,
          { kind: 'family', family: 'kubernetes', servers: [family] },
          tied,
        ),
      ),
    ).toEqual(['x_kubernetes_get_pods']);
    expect(
      toolsForRow(pods, { kind: 'server', server: singular }, tied),
    ).toEqual([]);
  });
});

describe('shortToolName', () => {
  const prefixes = serverPrefixInfos([
    mcpServer('walrus-mcp-kubernetes', { family: 'kubernetes' }),
    mcpServer('foo'),
    mcpServer('foo_bar'),
  ]);

  it('strips the prefix of the server offering the tool', () => {
    expect(shortToolName('x_kubernetes_get_pods', prefixes)).toBe('get_pods');
    expect(shortToolName('x_foo_bar_list', prefixes)).toBe('list');
    expect(shortToolName('x_walrus-mcp-kubernetes_describe', prefixes)).toBe(
      'describe',
    );
  });

  it('strips `core_` from muster’s own tools', () => {
    expect(shortToolName('core_workflow_list', prefixes)).toBe('workflow_list');
  });

  it('leaves a name nothing matches whole', () => {
    expect(shortToolName('workflow_deploy', prefixes)).toBe('workflow_deploy');
    expect(shortToolName('x_unknown_tool', prefixes)).toBe('x_unknown_tool');
  });
});

describe('serverPageResolver', () => {
  const serverPageOfTool = (name: string, servers: MCPServer[]) =>
    serverPageResolver(servers)(name);

  const walrus = mcpServer('walrus-mcp-kubernetes', { family: 'kubernetes' });
  const aws = mcpServer('aws-root', { toolPrefix: 'aws' });
  const all = [walrus, aws];

  it("puts muster's own tools and workflows on muster's page", () => {
    expect(serverPageOfTool('core_workflow_list', all)).toBe('muster');
    expect(serverPageOfTool('workflow_deploy', all)).toBe('muster');
  });

  it('files a family tool, also one muster exposes per instance, under the family', () => {
    expect(serverPageOfTool('x_kubernetes_get_pods', all)).toBe('kubernetes');
    expect(serverPageOfTool('x_walrus-mcp-kubernetes_describe', all)).toBe(
      'kubernetes',
    );
  });

  it("files a singular server's tool under its name, by its toolPrefix", () => {
    expect(serverPageOfTool('x_aws_list_buckets', all)).toBe('aws-root');
  });

  it('knows no page for an unattributed tool or a shadowed server', () => {
    expect(serverPageOfTool('x_unknown_thing', all)).toBeUndefined();
    const shadowed = mcpServer('kubernetes');
    expect(serverPageOfTool('x_kubernetes_only_mine', [shadowed])).toBe(
      'kubernetes',
    );
    expect(serverPageOfTool('x_kubernetes_only_mine', [shadowed, walrus])).toBe(
      'kubernetes',
    );
  });

  it('knows no page for a family named muster, whose page is the core row', () => {
    const musterFamily = mcpServer('muster-golem', { family: 'muster' });
    expect(serverPageOfTool('x_muster_foo', [musterFamily])).toBeUndefined();
  });
});
