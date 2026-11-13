/*
 * Fails when the production build of the app contains fixture code.
 *
 * The fixture modes (docs/fixtures.md) load their code only outside
 * production builds. Each marker below is a string that only its fixture
 * module contains; finding one in a built file means a fixture module reached
 * the production bundle. A new fixture module adds a marker here. A marker
 * its source no longer contains fails the check too, so a reworded fixture
 * cannot turn the check off unnoticed.
 *
 * The node-build job runs this (`.circleci/custom.yml`) after its Build step
 * (`ci:build`), whose backend build also builds the app.
 *
 * Usage: node scripts/check-bundle-fixtures.mjs [app dist, default packages/app/dist]
 */

import fs from 'node:fs';
import path from 'node:path';

const MARKERS = [
  {
    source: 'plugins/plans/src/apis/PlansFixtureApi.ts',
    marker: 'example/meadow-plans',
  },
  {
    source: 'plugins/plans/src/lib/hiveFixtures.ts',
    marker: 'Pods, events and logs of a workload cluster from its page',
  },
  {
    source: 'plugins/roadmap/src/apis/RoadmapFixtureApi.ts',
    marker: 'The change is proven in the lab',
  },
  {
    source: 'plugins/muster/src/apis/fixtures/MusterFixtureApi.ts',
    marker: 'Fixture mode has no handler for the tool',
  },
  {
    source: 'plugins/agent-platform/src/apis/fixtures/notInFixtures.ts',
    marker: 'Fixture mode does not answer',
  },
  {
    source: 'plugins/agent-platform/src/apis/fixtures/KagentFixtureApi.ts',
    marker: 'kagent streamMessage',
  },
  {
    source:
      'plugins/agent-platform/src/apis/fixtures/ModelManagerFixtureApi.ts',
    marker: 'model-manager pullModel',
  },
  {
    source:
      'plugins/agent-platform/src/apis/fixtures/AgentManagerCredentialsFixtureApi.ts',
    marker: 'agent-manager getOperation',
  },
  {
    source:
      'plugins/agent-platform/src/apis/fixtures/mcpServers/agentManager.ts',
    marker: 'oci://registry.example.com/charts/agent',
  },
  {
    source: 'plugins/gs-common/src/fixtures/builders.ts',
    marker: 'A builder needs at least one state.',
  },
  {
    source: 'plugins/muster/src/apis/fixtures/musterFixtureData.ts',
    marker: 'The server did not answer within the timeout.',
  },
  {
    source:
      'plugins/agent-platform/src/apis/fixtures/agentPlatformFixtureData.ts',
    marker: 'The worker running the session stopped answering.',
  },
  {
    source:
      'packages/app/src/modules/kubernetes/fixtures/KubernetesFixtureApi.ts',
    marker: 'Fixture mode does not answer the Kubernetes request',
  },
];

const root = path.resolve(import.meta.dirname, '..');
const stale = MARKERS.filter(({ source, marker }) => {
  const file = path.join(root, source);
  return (
    !fs.existsSync(file) || !fs.readFileSync(file, 'utf8').includes(marker)
  );
});
if (stale.length > 0) {
  console.error(
    'Markers their fixture source no longer contains: update MARKERS in scripts/check-bundle-fixtures.mjs:\n' +
      stale.map(({ source, marker }) => `  ${source}: ${marker}`).join('\n'),
  );
  process.exit(1);
}

const dist = path.resolve(process.argv[2] ?? 'packages/app/dist');
const files = fs
  .globSync('**/*.{js,html}', { cwd: dist })
  .map(file => path.join(dist, file));

if (files.length === 0) {
  console.error(`No built files in ${dist}: build the app first.`);
  process.exit(1);
}

const found = files.flatMap(file => {
  const content = fs.readFileSync(file, 'utf8');
  return MARKERS.filter(({ marker }) => content.includes(marker)).map(
    ({ source, marker }) =>
      `${path.relative(dist, file)}: ${marker} (from ${source})`,
  );
});

if (found.length > 0) {
  console.error(
    'Fixture code in the production bundle (docs/fixtures.md):\n' +
      found.map(line => `  ${line}`).join('\n'),
  );
  process.exit(1);
}

console.log(
  `No fixture code in ${files.length} built files of ${path.relative(process.cwd(), dist) || dist}.`,
);
