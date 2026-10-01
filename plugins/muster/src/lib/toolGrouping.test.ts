import { MCPServer } from './k8s';
import { serverPrefixInfos, shortToolName, toolsForRow } from './toolGrouping';

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
