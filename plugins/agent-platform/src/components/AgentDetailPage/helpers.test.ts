import {
  Agent,
  AgentInterface,
  RemoteMCPServer,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  describeToolScope,
  directServerLogo,
  isGatewayServerBinding,
  mcpBindingId,
  skillLabel,
} from './helpers';

function makeAgent(overrides: Partial<AgentInterface> = {}): Agent {
  return new Agent(
    {
      apiVersion: 'api.kagent.dev/v1alpha3',
      kind: 'Agent',
      metadata: { name: 'pr-reviewer', namespace: 'agent-platform' },
      ...overrides,
    } as AgentInterface,
    'gazelle',
  );
}

const binding = (name: string, tools?: string[]) => ({
  server: { kind: 'RemoteMCPServer', name },
  ...(tools ? { tools } : {}),
});

describe('isGatewayServerBinding', () => {
  const agent = makeAgent();

  // The Generic chart renders the gateway into a RemoteMCPServer named after the
  // agent — that is the carrier; a shared gateway server keeps its name.
  it('recognises the agent’s own carrier and the shared gateway', () => {
    expect(isGatewayServerBinding(agent, binding('pr-reviewer'))).toBe(true);
    expect(isGatewayServerBinding(agent, binding('muster'))).toBe(true);
  });

  it('does not claim any other server is the gateway', () => {
    expect(isGatewayServerBinding(agent, binding('grafana'))).toBe(false);
    expect(isGatewayServerBinding(agent, binding('muster-staging'))).toBe(
      false,
    );
  });
});

describe('mcpBindingId', () => {
  it('names the kind and the server', () => {
    expect(mcpBindingId(binding('grafana'))).toBe('RemoteMCPServer grafana');
  });
});

describe('directServerLogo', () => {
  const remote = (
    name: string,
    url: string,
    annotations?: Record<string, string>,
  ) =>
    new RemoteMCPServer(
      {
        apiVersion: 'api.kagent.dev/v1alpha3',
        kind: 'RemoteMCPServer',
        metadata: { name, namespace: 'agent-platform', annotations },
        spec: { url },
      } as never,
      'gazelle',
    );

  it('reads the bound RemoteMCPServer’s display name and URL', () => {
    expect(
      directServerLogo(binding('ghe'), [
        remote('ghe', 'https://ghe.corp.example/mcp', {
          'ui.giantswarm.io/display-name': 'GitHub Enterprise',
        }),
      ]),
    ).toEqual({
      name: 'GitHub Enterprise',
      url: 'https://ghe.corp.example/mcp',
    });
  });

  it('falls back to the resource’s name without a display name', () => {
    expect(
      directServerLogo(binding('github'), [
        remote('github', 'https://ghe.corp.example/mcp'),
      ]),
    ).toEqual({ name: 'github', url: 'https://ghe.corp.example/mcp' });
  });

  // A kagent MCPServer of the same name is a different resource: it must not
  // take the RemoteMCPServer's URL.
  it('matches the binding’s kind as well as its name', () => {
    expect(
      directServerLogo({ server: { kind: 'MCPServer', name: 'github' } }, [
        remote('github', 'https://ghe.corp.example/mcp'),
      ]),
    ).toEqual({ name: 'github' });
  });

  it('shows the bare name until the namespace is read', () => {
    expect(directServerLogo(binding('github'), undefined)).toEqual({
      name: 'github',
    });
  });
});

describe('describeToolScope', () => {
  // An absent allowlist means "everything", which is worth stating rather than
  // leaving to be inferred from a missing value.
  it('says all tools when no allowlist is set', () => {
    expect(describeToolScope(binding('grafana'))).toBe(
      'All tools from this server',
    );
    expect(describeToolScope(binding('grafana', []))).toBe(
      'All tools from this server',
    );
  });

  it('lists an allowlist and counts it', () => {
    expect(describeToolScope(binding('grafana', ['query', 'dashboards']))).toBe(
      '2 tools: query, dashboards',
    );
  });

  it('keeps the count singular for one tool', () => {
    expect(describeToolScope(binding('grafana', ['query']))).toBe(
      '1 tool: query',
    );
  });
});

describe('skillLabel', () => {
  it('prefers the explicit name', () => {
    expect(
      skillLabel({
        url: 'https://github.com/giantswarm/skills',
        path: 'pr/review',
        name: 'PR review conventions',
      }),
    ).toBe('PR review conventions');
  });

  it('falls back to the last path segment', () => {
    expect(
      skillLabel({
        url: 'https://github.com/giantswarm/skills',
        path: 'skills/idiomatic-go/',
      }),
    ).toBe('idiomatic-go');
  });

  it('falls back to the repository name, without the .git suffix', () => {
    expect(
      skillLabel({ url: 'https://github.com/giantswarm/skills.git' }),
    ).toBe('skills');
  });

  // A row with no label is unusable, so there is always something.
  it('falls back to the raw url when nothing else is available', () => {
    expect(skillLabel({ url: 'weird' })).toBe('weird');
  });
});
