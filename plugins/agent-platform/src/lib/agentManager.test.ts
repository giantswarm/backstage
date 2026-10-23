import {
  AgentManagerError,
  AgentManagerNotConnectedError,
  agentManagerToolName,
  classifyAgentManagerError,
  helmInstallCommand,
  isSettledVerdict,
  looksNotConnected,
  missingGitHubAuthorization,
  missingReleaseFile,
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

describe('missingReleaseFile', () => {
  // agent-manager's exact answer over MCP (internal/agents/commit.go
  // requireReleaseFile, wrapped by internal/api/mcp.go errResult) as of
  // giantswarm/agent-manager@334d94f. The portal recognises this refusal only
  // by its wording: when agent-manager rewords it, this test is where to update
  // the pattern, and the dialog falls back to showing the raw conflict.
  const WIRE =
    "conflict: conflict: HelmRelease flux-giantswarm/cluster-manager-agent is not in agent-manager's directory management-clusters/gazelle/extras/agent-manager of giantswarm/giantswarm-management-clusters (no management-clusters/gazelle/extras/agent-manager/cluster-manager-agent.yaml there): change it in the file that defines it";

  it("reads the release, directory, repository and checked path from agent-manager's answer", () => {
    const error = classifyAgentManagerError(new Error(WIRE));
    expect(error).toBeInstanceOf(AgentManagerError);
    expect(
      missingReleaseFile({
        code: (error as AgentManagerError).code,
        message: error.message,
      }),
    ).toEqual({
      release: 'flux-giantswarm/cluster-manager-agent',
      directory: 'management-clusters/gazelle/extras/agent-manager',
      repository: 'giantswarm/giantswarm-management-clusters',
      path: 'management-clusters/gazelle/extras/agent-manager/cluster-manager-agent.yaml',
    });
  });

  it('is undefined for any other refusal', () => {
    const message = WIRE.replace(/^conflict: /, '');
    expect(missingReleaseFile(undefined)).toBeUndefined();
    expect(
      missingReleaseFile({ code: 'invalid_request', message }),
    ).toBeUndefined();
    expect(
      missingReleaseFile({
        code: 'conflict',
        message: 'HelmRelease kagent/x is suspended',
      }),
    ).toBeUndefined();
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
    expect(helmInstallCommand(spec, { ...chart, latestVersion: '1.0.0' }))
      .toBe(`helm install pr-reviewer \\
  oci://gsoci.azurecr.io/charts/giantswarm/agent \\
  --version 1.0.0 \\
  --namespace kagent \\
  --values pr-reviewer-values.yaml`);
  });

  it('falls back to the range when the registry did not answer', () => {
    expect(helmInstallCommand(spec, chart)).toContain('--version 1.x');
  });
});

describe('missingGitHubAuthorization', () => {
  // agent-manager's two `auth_required` answers to a commit over MCP
  // (internal/agents/commit.go), as of giantswarm/agent-manager@334d94f. Only
  // the first is fixed by a sign-in; a rewording there turns it back into a
  // refusal the write shows, nothing worse.
  const NO_TOKEN =
    'auth_required: commit mode opens the pull request with your GitHub authorization, and this call carries none: connect agent-manager in muster (core_auth_login server=agent-manager), then call again';
  const TOKEN_REFUSED =
    'auth_required: GitHub refused your token on get contents (status 404): reconnect agent-manager in muster (core_auth_login server=agent-manager); the App must be installed on the repository and your account allowed to push to it';

  const failureOf = (wire: string) => {
    const error = classifyAgentManagerError(new Error(wire));
    return {
      code: (error as AgentManagerError).code,
      message: error.message,
    };
  };

  it('recognises a call that carried no GitHub authorization', () => {
    expect(missingGitHubAuthorization(failureOf(NO_TOKEN))).toBe(true);
  });

  it('leaves out a token GitHub refused, and every other refusal', () => {
    expect(missingGitHubAuthorization(failureOf(TOKEN_REFUSED))).toBe(false);
    expect(missingGitHubAuthorization(undefined)).toBe(false);
    expect(
      missingGitHubAuthorization({
        code: 'conflict',
        message: failureOf(NO_TOKEN).message,
      }),
    ).toBe(false);
  });
});
