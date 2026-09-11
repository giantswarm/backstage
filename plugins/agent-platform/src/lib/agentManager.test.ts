import {
  AgentManagerError,
  AgentManagerNotConnectedError,
  agentManagerToolName,
  classifyAgentManagerError,
  helmInstallCommand,
  isSettledVerdict,
  looksNotConnected,
} from './agentManager';

describe('agentManagerToolName', () => {
  it('addresses the tool the way muster exposes an aggregated server', () => {
    expect(agentManagerToolName('create_agent')).toBe(
      'x_agent-manager_create_agent',
    );
  });
});

describe('classifyAgentManagerError', () => {
  it("reads agent-manager's code prefix and keeps its message", () => {
    const error = classifyAgentManagerError(
      new Error(
        'forbidden: helmreleases.helm.toolkit.fluxcd.io is forbidden: User "oidc:viewer@lab.local" cannot create resource "helmreleases"',
      ),
    );
    expect(error).toBeInstanceOf(AgentManagerError);
    expect((error as AgentManagerError).code).toBe('forbidden');
    expect(error.message).toMatch(/^helmreleases.*cannot create/);
  });

  it('classifies a conflict for an existing name', () => {
    const error = classifyAgentManagerError(
      new Error('conflict: agent kagent/pr-reviewer already exists'),
    );
    expect((error as AgentManagerError).code).toBe('conflict');
  });

  it("recognises muster's not-connected answers", () => {
    const error = classifyAgentManagerError(
      new Error(
        'failed to connect to server agent-manager: user not authenticated to server agent-manager',
      ),
    );
    expect(error).toBeInstanceOf(AgentManagerNotConnectedError);
  });

  it('passes an unrelated error through', () => {
    const original = new Error('Muster request failed with status 502');
    expect(classifyAgentManagerError(original)).toBe(original);
  });

  it('does not mistake a colon in prose for a code', () => {
    const error = classifyAgentManagerError(
      new Error('Note: the request failed'),
    );
    expect(error).not.toBeInstanceOf(AgentManagerError);
  });
});

describe('looksNotConnected', () => {
  it.each([
    'tool not found: x_agent-manager_create_agent',
    'unknown tool x_agent-manager_get_info',
    'server agent-manager not connected',
    'authentication required',
  ])('matches %s', message => {
    expect(looksNotConnected(message)).toBe(true);
  });

  it('does not match a refusal', () => {
    expect(looksNotConnected('forbidden: cannot create')).toBe(false);
  });
});

describe('isSettledVerdict', () => {
  it('settles on ready and failed only', () => {
    expect(isSettledVerdict('ready')).toBe(true);
    expect(isSettledVerdict('failed')).toBe(true);
    expect(isSettledVerdict('progressing')).toBe(false);
    expect(isSettledVerdict('unknown')).toBe(false);
  });
});

describe('helmInstallCommand', () => {
  const spec = { name: 'pr-reviewer', namespace: 'kagent' };
  const chart = {
    ociUrl: 'oci://gsoci.azurecr.io/charts/giantswarm/agent',
    semver: '1.x',
  };

  it('installs the resolved latest version from the values file', () => {
    expect(
      helmInstallCommand(spec, { ...chart, latestVersion: '1.0.0' }),
    ).toBe(`helm install pr-reviewer \\
  oci://gsoci.azurecr.io/charts/giantswarm/agent \\
  --version 1.0.0 \\
  --namespace kagent \\
  --values pr-reviewer-values.yaml`);
  });

  it('falls back to the range when the registry did not answer', () => {
    expect(helmInstallCommand(spec, chart)).toContain('--version 1.x');
  });
});
