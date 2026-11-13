/*
 * Fails when the production build of the app contains fixture code.
 *
 * The fixture modes (docs/fixtures.md) load their code only outside
 * production builds. Each marker below is a string that only a fixture module
 * contains; finding one in a built file means a fixture module reached the
 * production bundle. A new fixture module adds a marker here.
 *
 * `ci:build` runs this after the backend build, which builds the app.
 *
 * Usage: node scripts/check-bundle-fixtures.mjs [app dist, default packages/app/dist]
 */

import fs from 'node:fs';
import path from 'node:path';

const MARKERS = [
  // plugins/plans/src/apis/PlansFixtureApi.ts
  'example/meadow-plans',
  // plugins/plans/src/lib/hiveFixtures.ts
  'Pods, events and logs of a workload cluster from its page',
  // plugins/roadmap/src/apis/RoadmapFixtureApi.ts
  'The change is proven in the lab',
];

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
  return MARKERS.filter(marker => content.includes(marker)).map(
    marker => `${path.relative(dist, file)}: ${marker}`,
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
