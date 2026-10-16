import { legacyAgentPlatformTarget } from './legacyPaths';

/**
 * Where `address` (path and query) redirects to, as one string, or undefined
 * where it keeps its place. `home` stands for the pinned scope or the home
 * installation the caller supplies.
 */
function targetOf(address: string): string | undefined {
  const [pathname, query] = address.split('?');
  const target = legacyAgentPlatformTarget(
    pathname,
    query === undefined ? '' : `?${query}`,
    { defaultInstallation: 'home' },
  );
  return target && `${target.pathname}${target.search}`;
}

type Row = [old: string, target: string | undefined];

// One row per route in giantswarm/giantswarm#38510's inventory ("URL
// inventory by area"), each with its final address in the target scheme
// ("Decisions and plan"). The command palette's row lists other rows'
// addresses and has none of its own.
describe('legacyAgentPlatformTarget: the inventory', () => {
  describe('shell entry points', () => {
    it.each<Row>([
      ['/', undefined],
      ['/?agent=alpha/kagent/sre', undefined],
      ['/agent-platform', '/'],
      ['/agent-platform/unknown', '/'],
      ['/agent-platform/sessions', '/sessions'],
      [
        '/agent-platform/sessions?q=deploy&state=failed',
        '/sessions?q=deploy&state=failed',
      ],
      ['/agent-platform/sessions/alpha/abc123', '/sessions/alpha/abc123'],
    ])('%s → %s', (old, target) => {
      expect(targetOf(old)).toBe(target);
    });
  });

  describe('agents', () => {
    it.each<Row>([
      ['/customize/agents?q=sre&installation=alpha', undefined],
      [
        '/agent-platform/agents?installation=alpha',
        '/customize/agents?installation=alpha',
      ],
      ['/agent-platform/agents/new', '/customize/agents/new'],
      ['/agent-platform/agents/new/skills', '/customize/agents/new/skills'],
      ['/agent-platform/agents/new/tools', '/customize/agents/new/tools'],
      ['/agent-platform/agents/new/review', '/customize/agents/new/review'],
      [
        '/agent-platform/agents/alpha/kagent/sre',
        '/customize/agents/alpha/kagent/sre',
      ],
      [
        '/agent-platform/agents/alpha/kagent/sre/sessions?q=x',
        '/customize/agents/alpha/kagent/sre/sessions?q=x',
      ],
      [
        '/agent-platform/agents/alpha/kagent/sre/tools',
        '/customize/agents/alpha/kagent/sre/tools',
      ],
      [
        '/agent-platform/agents/alpha/kagent/sre/usage',
        '/customize/agents/alpha/kagent/sre/usage',
      ],
      [
        '/agent-platform/agents/edit/alpha/kagent/sre',
        '/customize/agents/alpha/kagent/sre/edit',
      ],
      [
        '/agent-platform/agents/edit/alpha/kagent/sre/skills',
        '/customize/agents/alpha/kagent/sre/edit/skills',
      ],
      [
        '/agent-platform/agents/edit/alpha/kagent/sre/tools',
        '/customize/agents/alpha/kagent/sre/edit/tools',
      ],
      [
        '/agent-platform/agents/edit/alpha/kagent/sre/review',
        '/customize/agents/alpha/kagent/sre/edit/review',
      ],
      [
        '/agent-platform/agents/alpha/kagent/sre/edit',
        '/customize/agents/alpha/kagent/sre/edit',
      ],
      ['/agents', '/customize/agents'],
      ['/agents?q=sre', '/customize/agents?q=sre'],
      ['/agents/new/tools', '/customize/agents/new/tools'],
      [
        '/agents/alpha/kagent/sre/usage',
        '/customize/agents/alpha/kagent/sre/usage',
      ],
    ])('%s → %s', (old, target) => {
      expect(targetOf(old)).toBe(target);
    });
  });

  describe('skills', () => {
    it.each<Row>([
      ['/customize/skills?q=triage', undefined],
      ['/agent-platform/skills', '/customize/skills'],
      ['/agent-platform/skills/new', '/customize/skills/new'],
      ['/agent-platform/skills/acme/skills', '/customize/skills/acme/skills'],
      [
        '/agent-platform/skills/acme/skills/ops/ticket-triage',
        '/customize/skills/acme/skills/ops/ticket-triage',
      ],
      [
        '/agent-platform/skills/acme/skills/ticket-triage/instructions',
        '/customize/skills/acme/skills/ticket-triage/instructions',
      ],
      [
        '/agent-platform/skills/acme/skills/ticket-triage/used-by',
        '/customize/skills/acme/skills/ticket-triage/used-by',
      ],
      [
        '/agent-platform/skills/acme/skills/ticket-triage?file=scripts%2Frun.sh',
        '/customize/skills/acme/skills/ticket-triage?file=scripts%2Frun.sh',
      ],
      [
        '/agent-platform/skills/-/gitea.lab.local/lab/skills/-/ticket-triage/used-by',
        '/customize/skills/-/gitea.lab.local/lab/skills/-/ticket-triage/used-by',
      ],
      [
        '/agent-platform/skills/edit/acme/skills/ticket-triage',
        '/customize/skills/edit/acme/skills/ticket-triage',
      ],
      [
        '/agent-platform/skills/edit/-/gitea.lab.local/lab/skills/-/ticket-triage',
        '/customize/skills/edit/-/gitea.lab.local/lab/skills/-/ticket-triage',
      ],
    ])('%s → %s', (old, target) => {
      expect(targetOf(old)).toBe(target);
    });
  });

  describe('connectors and tools', () => {
    it.each<Row>([
      ['/customize/connectors?q=git&installation=alpha', undefined],
      ['/customize/connectors/infrastructure', undefined],
      ['/customize/connectors/internal', undefined],
      [
        '/agent-platform/connectors?installation=alpha&q=git',
        '/customize/connectors?installation=alpha&q=git',
      ],
      ['/agent-platform/connectors/new', '/customize/connectors/new'],
      ['/agent-platform/connectors/new/auth', '/customize/connectors/new/auth'],
      [
        '/agent-platform/connectors/new/verify',
        '/customize/connectors/new/verify',
      ],
      [
        '/agent-platform/connectors/kubernetes?installation=alpha',
        '/customize/connectors/alpha/kubernetes',
      ],
      [
        '/agent-platform/connectors/kubernetes?installation=alpha&q=pods&effect=read',
        '/customize/connectors/alpha/kubernetes?q=pods&effect=read',
      ],
      [
        '/agent-platform/connectors/kubernetes/resources?installation=alpha',
        '/customize/connectors/alpha/kubernetes/resources',
      ],
      [
        '/agent-platform/connectors/kubernetes/prompts?installation=alpha',
        '/customize/connectors/alpha/kubernetes/prompts',
      ],
      [
        '/agent-platform/connectors/kubernetes/used-by?installation=alpha',
        '/customize/connectors/alpha/kubernetes/used-by',
      ],
      [
        '/agent-platform/connectors/kubernetes/instances?installation=alpha&pane=mcp-server-instance&cluster=c1&kind=MCPServer&name=k8s&namespace=muster',
        '/customize/connectors/alpha/kubernetes/instances?pane=mcp-server-instance&cluster=c1&kind=MCPServer&name=k8s&namespace=muster',
      ],
      [
        '/agent-platform/connectors/kubernetes/details?installation=alpha',
        '/customize/connectors/alpha/kubernetes/details',
      ],
      [
        '/agent-platform/connectors/muster',
        '/customize/connectors/home/muster',
      ],
      // Without `?installation=`, the pinned scope or the home installation.
      [
        '/agent-platform/connectors/kubernetes',
        '/customize/connectors/home/kubernetes',
      ],
      [
        '/agent-platform/connectors/kubernetes/tools/x_kubernetes_get?installation=alpha&q=pods',
        '/customize/connectors/alpha/kubernetes/tools/x_kubernetes_get?q=pods',
      ],
      [
        '/agent-platform/connectors/kubernetes/tools/x_kubernetes_get',
        '/customize/connectors/home/kubernetes/tools/x_kubernetes_get',
      ],
      [
        '/agent-platform/connectors/new?edit=github&installation=alpha',
        '/customize/connectors/alpha/github/edit',
      ],
      [
        '/agent-platform/connectors/new/auth?edit=github&installation=alpha',
        '/customize/connectors/alpha/github/edit/auth',
      ],
      [
        '/agent-platform/connectors/new/verify?edit=github',
        '/customize/connectors/home/github/edit/verify',
      ],
      [
        '/agent-platform/mcp-servers/kubernetes?installation=alpha',
        '/customize/connectors/alpha/kubernetes',
      ],
    ])('%s → %s', (old, target) => {
      expect(targetOf(old)).toBe(target);
    });
  });

  describe('workflows', () => {
    it.each<Row>([
      ['/customize/workflows?q=deploy&installation=alpha', undefined],
      [
        '/agent-platform/workflows?installation=alpha',
        '/customize/workflows?installation=alpha',
      ],
      [
        '/agent-platform/workflows/deploy-app?installation=alpha',
        '/customize/workflows/alpha/deploy-app',
      ],
      [
        '/agent-platform/workflows/deploy-app/run?installation=alpha',
        '/customize/workflows/alpha/deploy-app/run',
      ],
      [
        '/agent-platform/workflows/deploy-app/usage?installation=alpha',
        '/customize/workflows/alpha/deploy-app/usage',
      ],
      [
        '/agent-platform/workflows/deploy-app/details?installation=alpha',
        '/customize/workflows/alpha/deploy-app/details',
      ],
      [
        '/agent-platform/workflows/deploy-app',
        '/customize/workflows/home/deploy-app',
      ],
    ])('%s → %s', (old, target) => {
      expect(targetOf(old)).toBe(target);
    });
  });

  describe('models and model hosting', () => {
    it.each<Row>([
      ['/customize/models?q=llama&installation=alpha', undefined],
      ['/customize/models/alpha/kagent/llama', undefined],
      [
        '/agent-platform/models?installation=alpha',
        '/customize/models?installation=alpha',
      ],
      ['/agent-platform/models/new', '/customize/models/new'],
      [
        '/agent-platform/models/edit/alpha/kagent/llama',
        '/customize/models/alpha/kagent/llama/edit',
      ],
      [
        '/agent-platform/models/serving?installation=alpha',
        '/customize/models/hosting?installation=alpha',
      ],
      [
        '/agent-platform/models/capacity?installation=alpha',
        '/customize/models/hosting/capacity?installation=alpha',
      ],
      [
        '/agent-platform/models/cache?installation=alpha',
        '/customize/models/hosting/cache?installation=alpha',
      ],
      [
        '/agent-platform/models/serving/serve?installation=alpha&backend=kserve&cluster=c1&pool=gpu&model=llama',
        '/customize/models/hosting/serve?installation=alpha&backend=kserve&cluster=c1&pool=gpu&model=llama',
      ],
      [
        '/agent-platform/models/serving/import',
        '/customize/models/hosting/import',
      ],
      ['/agent-platform/models/serving/pull', '/customize/models/hosting/pull'],
      [
        '/agent-platform/models/serving/add-backend',
        '/customize/models/hosting/add-backend',
      ],
      [
        '/agent-platform/models/capacity/add-pool',
        '/customize/models/hosting/capacity/add-pool',
      ],
      [
        '/agent-platform/models/serving?serve=1&installation=alpha&cluster=c1&pool=gpu&preset=llama',
        '/customize/models/hosting/serve?installation=alpha&cluster=c1&pool=gpu&model=llama',
      ],
      ['/agent-platform/models/configs?q=llama', '/customize/models?q=llama'],
      ['/agent-platform/models/configs/new', '/customize/models/new'],
      [
        '/agent-platform/models/configs/alpha/kagent/llama',
        '/customize/models/alpha/kagent/llama',
      ],
      [
        '/agent-platform/models/alpha/kagent/llama',
        '/customize/models/alpha/kagent/llama',
      ],
    ])('%s → %s', (old, target) => {
      expect(targetOf(old)).toBe(target);
    });
  });

  describe('usage', () => {
    it.each<Row>([
      [
        '/agent-platform/usage?installation=alpha&window=30d',
        '/usage?installation=alpha&window=30d',
      ],
      ['/agent-platform/usage/overview?window=7d', '/usage?window=7d'],
      ['/agent-platform/usage/cost?window=90d', '/usage/cost?window=90d'],
      ['/agent-platform/usage/conversations', '/usage/conversations'],
      ['/agent-platform/usage/connectors', '/usage/connectors'],
      ['/agent-platform/usage/mcp', '/usage/connectors'],
      ['/agent-platform/usage/technical', '/usage'],
      ['/agent-platform/usage/sessions', '/usage'],
    ])('%s → %s', (old, target) => {
      expect(targetOf(old)).toBe(target);
    });
  });

  describe('workspaces, Customize itself, profile and classic pages', () => {
    it.each<Row>([
      ['/customize/workspaces?organization=acme&installation=alpha', undefined],
      ['/customize', undefined],
      ['/customize/agents', undefined],
      ['/customize/connectors/families', undefined],
      ['/agent-platform/profile', '/profile'],
      ['/settings', undefined],
      ['/clusters', undefined],
      ['/deployments/alpha/helmrelease/kagent/sre', undefined],
      ['/installations', undefined],
    ])('%s → %s', (old, target) => {
      expect(targetOf(old)).toBe(target);
    });
  });
});

// One row per row of #38510's "Redirects and legacy paths" table: the old
// address goes straight to where its chain of redirects ended. The rows
// under `/customize` stay with the Customize page's own routes.
describe('legacyAgentPlatformTarget: the redirects and legacy paths', () => {
  it.each<Row>([
    // `/agent-platform` → `/agent-platform/sessions` (first tab).
    ['/agent-platform', '/'],
    // `/agents/**` → `/agent-platform/agents/**`.
    ['/agents/alpha/kagent/sre', '/customize/agents/alpha/kagent/sre'],
    // `/agent-platform/agents` → `/customize/agents`.
    ['/agent-platform/agents', '/customize/agents'],
    // `…/<name>/edit` → `edit/…`.
    [
      '/agent-platform/agents/alpha/kagent/sre/edit',
      '/customize/agents/alpha/kagent/sre/edit',
    ],
    // An agent's unknown tab → its Overview. (`/tools` on an agent without
    // tools depends on the agent; its page sends that to Overview.)
    [
      '/agent-platform/agents/alpha/kagent/sre/skills?q=x',
      '/customize/agents/alpha/kagent/sre?q=x',
    ],
    // An unknown edit step → the edit index.
    [
      '/agent-platform/agents/edit/alpha/kagent/sre/unknown',
      '/customize/agents/alpha/kagent/sre/edit',
    ],
    // `/agent-platform/skills`; an unparsable skill path → `/customize/skills`.
    ['/agent-platform/skills', '/customize/skills'],
    ['/agent-platform/skills/acme', '/customize/skills'],
    ['/agent-platform/skills/-/gitea.lab.local', '/customize/skills'],
    ['/agent-platform/skills/edit/acme', '/customize/skills'],
    // Skill `/instructions` on an unreadable skill depends on the skill; its
    // page sends that to Overview.
    [
      '/agent-platform/skills/acme/skills/ticket-triage/instructions',
      '/customize/skills/acme/skills/ticket-triage/instructions',
    ],
    // `/agent-platform/mcp-servers/**` → `/agent-platform/connectors/**`.
    ['/agent-platform/mcp-servers', '/customize/connectors'],
    [
      '/agent-platform/mcp-servers/new/auth?edit=github&installation=alpha',
      '/customize/connectors/alpha/github/edit/auth',
    ],
    [
      '/agent-platform/mcp-servers/kubernetes/tools/x_kubernetes_get?installation=alpha',
      '/customize/connectors/alpha/kubernetes/tools/x_kubernetes_get',
    ],
    // `/agent-platform/connectors` → `/customize/connectors`.
    ['/agent-platform/connectors?q=git', '/customize/connectors?q=git'],
    // `new/review` → `new/auth`, an edit's `?edit=` with it.
    ['/agent-platform/connectors/new/review', '/customize/connectors/new/auth'],
    [
      '/agent-platform/connectors/new/review?edit=github&installation=alpha',
      '/customize/connectors/alpha/github/edit/auth',
    ],
    // A connector's unknown tab → the connector.
    [
      '/agent-platform/connectors/kubernetes/unknown?installation=alpha&q=pods',
      '/customize/connectors/alpha/kubernetes?q=pods',
    ],
    // `/customize/connectors/families` and `/customize/connectors/<unknown>`
    // stay with the Customize page.
    ['/customize/connectors/families', undefined],
    ['/customize/connectors/unknown', undefined],
    // `/agent-platform/workflows` → `/customize/workflows`.
    ['/agent-platform/workflows', '/customize/workflows'],
    // A workflow's unknown tab → its Overview.
    [
      '/agent-platform/workflows/deploy-app/unknown?installation=alpha',
      '/customize/workflows/alpha/deploy-app',
    ],
    // `/agent-platform/models` → `/customize/models`.
    ['/agent-platform/models', '/customize/models'],
    // `configs` → `/agent-platform/models` → `/customize/models`.
    ['/agent-platform/models/configs', '/customize/models'],
    // `configs/new` → `/agent-platform/models/new`.
    ['/agent-platform/models/configs/new', '/customize/models/new'],
    // Both former detail shapes → the model under `/customize`.
    [
      '/agent-platform/models/configs/alpha/kagent/llama?q=x',
      '/customize/models/alpha/kagent/llama?q=x',
    ],
    [
      '/agent-platform/models/alpha/kagent/llama',
      '/customize/models/alpha/kagent/llama',
    ],
    // Anything else under models → Running models.
    [
      '/agent-platform/models/unknown?installation=alpha',
      '/customize/models/hosting?installation=alpha',
    ],
    ['/agent-platform/models/serving/unknown', '/customize/models/hosting'],
    // `serving?serve=1&…` → Serve model with the same seed.
    [
      '/agent-platform/models/serving?serve=1&installation=alpha&pool=gpu',
      '/customize/models/hosting/serve?installation=alpha&pool=gpu',
    ],
    // `/agent-platform/usage` → `/usage/overview`, now the bare path.
    ['/agent-platform/usage', '/usage'],
    // `usage/mcp` → Connectors (`/usage/connectors` itself shows Overview
    // where muster is not registered).
    ['/agent-platform/usage/mcp?window=7d', '/usage/connectors?window=7d'],
    // `usage/technical`, `usage/<anything else>` → Overview.
    ['/agent-platform/usage/technical', '/usage'],
    ['/agent-platform/usage/cost/unknown', '/usage'],
    // `/customize`, `/customize/<unknown>`, `/customize/skills` without
    // repositories stay with the Customize page.
    ['/customize', undefined],
    ['/customize/unknown', undefined],
    ['/customize/skills', undefined],
  ])('%s → %s', (old, target) => {
    expect(targetOf(old)).toBe(target);
  });
});

describe('legacyAgentPlatformTarget: unknown sub-paths go to the nearest valid parent', () => {
  it.each<Row>([
    ['/agent-platform/sessions/alpha', '/sessions'],
    ['/agent-platform/sessions/alpha/abc123/unknown', '/sessions/alpha/abc123'],
    ['/agent-platform/agents/alpha', '/customize/agents'],
    ['/agent-platform/agents/alpha/kagent', '/customize/agents'],
    ['/agent-platform/agents/new/unknown', '/customize/agents/new'],
    [
      '/agent-platform/agents/alpha/kagent/sre/tools/unknown',
      '/customize/agents/alpha/kagent/sre',
    ],
    [
      '/agent-platform/connectors/kubernetes/tools?installation=alpha',
      '/customize/connectors/alpha/kubernetes',
    ],
    [
      '/agent-platform/workflows/deploy-app/run/unknown?installation=alpha',
      '/customize/workflows/alpha/deploy-app',
    ],
    ['/agent-platform/profile/unknown', '/profile'],
  ])('%s → %s', (old, target) => {
    expect(targetOf(old)).toBe(target);
  });
});

describe("legacyAgentPlatformTarget: the old routers' ranking", () => {
  it.each<Row>([
    // The wizards' routes are exact; a deeper `new/…` was a detail page.
    ['/agent-platform/agents/new/skills/x', '/customize/agents/new/skills/x'],
    ['/agent-platform/agents/new/ns/foo', '/customize/agents/new/ns/foo'],
    // `…/<name>/edit` outranks the edit wizard's splat.
    ['/agent-platform/agents/edit/a/b/edit', '/customize/agents/edit/a/b/edit'],
    // `edit/a/b` is the agent `b` in namespace `a` on installation `edit`.
    ['/agent-platform/agents/edit/a/b', '/customize/agents/edit/a/b'],
    // An edit step with more after it is the edit index.
    [
      '/agent-platform/agents/edit/i/n/a/skills/extra',
      '/customize/agents/i/n/a/edit',
    ],
    // `new/<not a step>` and `new/tools/<tool>` were a connector named `new`.
    [
      '/agent-platform/connectors/new/unknown',
      '/customize/connectors/home/new',
    ],
    [
      '/agent-platform/connectors/new/tools/search?installation=alpha',
      '/customize/connectors/alpha/new/tools/search',
    ],
    ['/agent-platform/connectors/new/auth/x', '/customize/connectors/home/new'],
    // Static segments compare case-insensitively; names keep their case.
    ['/AGENTS', '/customize/agents'],
    [
      '/Agent-Platform/Agents/Alpha/kagent/SRE/Tools',
      '/customize/agents/Alpha/kagent/SRE/tools',
    ],
    ['/agent-platform/models/Configs', '/customize/models'],
    ['/agent-platform/Usage/MCP', '/usage/connectors'],
    [
      '/agent-platform/connectors/new/Auth?edit=github',
      '/customize/connectors/home/github/edit/auth',
    ],
  ])('%s → %s', (old, target) => {
    expect(targetOf(old)).toBe(target);
  });
});

describe('legacyAgentPlatformTarget: addresses', () => {
  it('ignores a trailing slash', () => {
    expect(targetOf('/agent-platform/agents/')).toBe('/customize/agents');
    expect(targetOf('/agent-platform/')).toBe('/');
  });

  it('keeps path segments as they were encoded', () => {
    expect(
      targetOf('/agent-platform/skills/acme/skills/ops%2Fnested/used-by'),
    ).toBe('/customize/skills/acme/skills/ops%2Fnested/used-by');
  });

  it('encodes an installation or connector name it moves into the path', () => {
    expect(
      targetOf(
        '/agent-platform/connectors/new?edit=my%20server&installation=a%2Fb',
      ),
    ).toBe('/customize/connectors/a%2Fb/my%20server/edit');
  });

  it('keeps the query as it was written', () => {
    expect(targetOf('/agent-platform?agent=alpha/kagent/sre')).toBe(
      '/?agent=alpha/kagent/sre',
    );
    expect(targetOf('/agent-platform/sessions?q=a%20b+c')).toBe(
      '/sessions?q=a%20b+c',
    );
    expect(
      targetOf(
        '/agent-platform/connectors/kubernetes?installation=alpha&q=a%20b',
      ),
    ).toBe('/customize/connectors/alpha/kubernetes?q=a%20b');
  });

  it("reads a pool link's seed as Serve model does", () => {
    expect(
      targetOf(
        '/agent-platform/models/serving?serve=1&installation=alpha&model=%20&preset=llama&backend=unknown&extra=1',
      ),
    ).toBe('/customize/models/hosting/serve?installation=alpha&model=llama');
  });

  it("reads a skill's path as the skill page does", () => {
    expect(targetOf('/agent-platform/skills/%2D/gitea.lab.local/lab')).toBe(
      '/customize/skills/%2D/gitea.lab.local/lab',
    );
    expect(targetOf('/agent-platform/skills/acme/%E0%A4%A')).toBe(
      '/customize/skills',
    );
  });

  it('treats an empty ?installation= as none', () => {
    expect(targetOf('/agent-platform/workflows/deploy-app?installation=')).toBe(
      '/customize/workflows/home/deploy-app',
    );
  });

  it('leaves the hash to the caller', () => {
    expect(
      legacyAgentPlatformTarget('/agent-platform/agents', '', {
        defaultInstallation: 'home',
      }),
    ).toEqual({ pathname: '/customize/agents', search: '' });
  });

  it('keeps addresses that only share a prefix with the old roots', () => {
    expect(targetOf('/agent-platform-docs')).toBeUndefined();
    expect(targetOf('/agentsmith')).toBeUndefined();
  });
});
