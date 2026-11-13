/**
 * The installation fixture mode serves (docs/fixtures.md). Every fixture API
 * (gs's Kubernetes API and cluster access, muster, agent-platform) serves this
 * one and fails loudly for any other; `app-config.fixtures.yaml` names it in
 * `gs.installations`, which a test checks.
 */
export const FIXTURE_INSTALLATION = 'meadow';

/**
 * Where a plugin attaches the fixture MCP servers its pages call through
 * muster: the id of muster's extension data ref and the input of
 * `api:muster/muster` that reads it. Here rather than in the muster plugin so
 * a contributing plugin needs nothing of muster's at runtime: many tests mock
 * the muster package wholesale, which would leave an imported ref undefined
 * when the contributing plugin loads.
 */
export const FIXTURE_MCP_SERVERS = {
  dataRefId: 'muster.fixture-mcp-servers',
  attachTo: { id: 'api:muster/muster', input: 'fixtureServers' },
} as const;
