/*
 * Fails when a workspace package is installed anywhere under node_modules as
 * something other than a symlink to its own workspace directory.
 *
 * With nodeLinker: node-modules, Yarn links every workspace package into
 * node_modules. A real directory under that name (a materialized copy, for
 * example from a restored node_modules cache) would shadow the workspace
 * source: the backend bundle and the tests would resolve the copy, and a
 * source change without a version bump would ship stale while every check
 * passes. `ci:build` runs this before bundling, so the image never builds on
 * such a tree.
 *
 * Usage: node scripts/check-workspace-links.mjs [repo root, default cwd]
 */

import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? '.');
const { workspaces } = JSON.parse(
  fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
);
const patterns = Array.isArray(workspaces) ? workspaces : workspaces.packages;

const packages = patterns
  .flatMap(pattern => fs.globSync(`${pattern}/package.json`, { cwd: root }))
  .map(manifest => ({
    name: JSON.parse(fs.readFileSync(path.join(root, manifest), 'utf8')).name,
    dir: fs.realpathSync(path.join(root, path.dirname(manifest))),
  }));

// Workspace packages are hoisted to the root node_modules or, on a version
// conflict, nested in a workspace's own node_modules.
const nodeModulesDirs = [root, ...packages.map(pkg => pkg.dir)]
  .map(dir => path.join(dir, 'node_modules'))
  .filter(dir => fs.existsSync(dir));

const problems = [];
for (const nodeModules of nodeModulesDirs) {
  for (const pkg of packages) {
    const entry = path.join(nodeModules, pkg.name);
    let stat;
    try {
      stat = fs.lstatSync(entry);
    } catch {
      continue;
    }
    const where = path.relative(root, entry);
    if (!stat.isSymbolicLink()) {
      problems.push(
        `${where} is a real directory, not a link to the workspace`,
      );
      continue;
    }
    const target = path.resolve(path.dirname(entry), fs.readlinkSync(entry));
    if (!fs.existsSync(target) || fs.realpathSync(target) !== pkg.dir) {
      problems.push(`${where} links to ${target}, not ${pkg.dir}`);
    }
  }
}

if (problems.length > 0) {
  console.error(
    [
      'Workspace packages are not linked to their sources:',
      ...problems.map(problem => `  - ${problem}`),
      'The node_modules tree (or the cache it was restored from) is stale;',
      'remove node_modules and run `yarn install` again.',
    ].join('\n'),
  );
  process.exit(1);
}

console.log(
  `${packages.length} workspace packages, all linked to their sources ` +
    `(${nodeModulesDirs.length} node_modules directories checked)`,
);
