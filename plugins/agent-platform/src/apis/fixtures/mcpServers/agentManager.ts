// eslint-disable-next-line @backstage/no-mixed-plugin-imports -- fixture MCP servers are muster's.
import type { FixtureMcpServer } from '@giantswarm/backstage-plugin-muster';

import {
  AGENT_MANAGER_SERVER,
  AGENT_MANAGER_TOOLS,
  type AgentManagerInfo,
} from '../../../lib/agentManager';
import { FIXTURE_INSTALLATION } from '../fixtureIdentity';

/** What the fixture agent-manager composes and can do. */
const info: AgentManagerInfo = {
  version: '1.0.0-fixture',
  chart: {
    ociUrl: 'oci://registry.example.com/charts/agent',
    semver: '1.x',
    latestVersion: '1.0.0',
    schemaVersion: '1.0.0',
    schemaSource: 'registry',
  },
  namespaces: { default: 'kagent', managed: ['kagent'] },
  capabilities: { create: true, validate: true, commit: false, tags: true },
  identity: 'caller',
  apiVersions: {
    agent: 'kagent.dev/v1alpha2',
    agentTemplate: 'kagent.dev/v1alpha2',
    harness: 'kagent.dev/v1alpha2',
    remoteMcpServer: 'kagent.dev/v1alpha2',
    modelConfig: 'kagent.dev/v1alpha2',
    helmRelease: 'helm.toolkit.fluxcd.io/v2',
    ociRepository: 'source.toolkit.fluxcd.io/v1',
  },
  flux: { helmReleaseInterval: '10m', ociRepositoryInterval: '30m' },
  harness: { name: 'kagent' },
  muster: { url: `https://muster.${FIXTURE_INSTALLATION}.example.com/mcp` },
  skillsRepositories: [],
};

/** agent-manager's tools in fixture mode. */
export const agentManager: FixtureMcpServer = {
  server: AGENT_MANAGER_SERVER,
  tools: {
    [AGENT_MANAGER_TOOLS.getInfo]: () => info,
  },
};
