import {
  Agent,
  AgentTemplateInterface,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  describeToolScope,
  isGatewayServerBinding,
  mcpBindingId,
  shortPin,
  skillLabel,
} from './helpers';

type AgentInterface = AgentTemplateInterface;

function makeAgent(overrides: Partial<AgentInterface> = {}): Agent {
  return new Agent(
    {
      apiVersion: 'kagent.dev/v1alpha3',
      kind: 'AgentTemplate',
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

describe('shortPin', () => {
  it('shortens a git commit the way git log --oneline does', () => {
    expect(shortPin('0123456789abcdef0123456789abcdef01234567')).toBe(
      '0123456789ab',
    );
  });

  it('keeps the algorithm prefix of a digest', () => {
    expect(shortPin(`sha256:${'f'.repeat(64)}`)).toBe(
      `sha256:${'f'.repeat(12)}`,
    );
  });

  it('leaves anything else alone', () => {
    expect(shortPin('v-42')).toBe('v-42');
  });
});
