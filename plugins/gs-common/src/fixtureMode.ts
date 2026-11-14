/**
 * The made-up installations fixture mode serves (docs/fixtures.md). Every
 * fixture API (gs's Kubernetes API and cluster access, muster,
 * agent-platform) serves these and fails loudly for any other;
 * `app-config.fixtures.yaml` names them in `gs.installations`, which a test
 * checks.
 */
export const FIXTURE_INSTALLATIONS = ['meadow', 'fennel', 'tarragon'] as const;

/** The first of {@link FIXTURE_INSTALLATIONS}, reachable in every data set. */
export const FIXTURE_INSTALLATION = FIXTURE_INSTALLATIONS[0];

/** Whether fixture mode serves an installation. */
export function isFixtureInstallation(installation: string): boolean {
  return (FIXTURE_INSTALLATIONS as readonly string[]).includes(installation);
}

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
