/**
 * CI coverage gate for the `ui-react` Storybook.
 *
 * Thin I/O wrapper around the pure `checkStoryCoverage` function: it reads the
 * real barrel exports, discovers the real story files, loads the allowlist, and
 * fails (exit 1) when an exported component has no story or when the allowlist
 * has a stale entry. All the logic lives in (and is unit-tested via)
 * `plugins/ui-react/src/storybook/storyCoverage.ts`.
 *
 * Run with: `yarn storybook:coverage` (→ `tsx scripts/check-story-coverage.mts`).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkStoryCoverage } from '../plugins/ui-react/src/storybook/storyCoverage.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const uiReactSrc = join(repoRoot, 'plugins', 'ui-react', 'src');
const componentsIndex = join(uiReactSrc, 'components', 'index.ts');
const allowlistPath = join(
  repoRoot,
  '.storybook',
  'story-coverage-allowlist.json',
);

/**
 * Component names barrel-exported by the library: every `export * from './X/Y'`
 * in components/index.ts contributes its last path segment (the component name).
 *
 * Invariant this relies on: each component directory is named after the
 * component it exports (our repo convention — one component per directory,
 * `ComponentName/ComponentName.tsx`). The gate therefore keys on the directory
 * (path segment) rather than resolving the actual exported symbol. If a
 * directory ever exports a differently-named component, this derivation — and
 * the matching story-file name below — would need to resolve real exports
 * instead. The `danglingStories` check in `checkStoryCoverage` guards the
 * inverse (a story with no matching export).
 */
function readExportedComponents(): string[] {
  const source = readFileSync(componentsIndex, 'utf8');
  const names = new Set<string>();
  const re = /export\s+\*\s+from\s+['"]\.\/(.+?)['"]/g;
  for (const match of source.matchAll(re)) {
    const segments = match[1].split('/');
    names.add(segments[segments.length - 1]);
  }
  return [...names];
}

/**
 * All story files under the plugin, as component names. Matches both
 * `*.stories.tsx` and `*.stories.ts` to stay in sync with the Storybook `stories`
 * glob in `.storybook/main.ts` (`*.stories.@(ts|tsx)`).
 */
const STORY_FILE_RE = /\.stories\.tsx?$/;

function readStoriedComponents(): string[] {
  const names = new Set<string>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (STORY_FILE_RE.test(entry.name)) {
        names.add(entry.name.replace(STORY_FILE_RE, ''));
      }
    }
  };
  walk(uiReactSrc);
  return [...names];
}

function readAllowlist(): string[] {
  const raw = JSON.parse(readFileSync(allowlistPath, 'utf8'));
  const list: unknown = Array.isArray(raw) ? raw : raw.components;
  if (!Array.isArray(list) || list.some(x => typeof x !== 'string')) {
    throw new Error(
      `Invalid allowlist at ${allowlistPath}: expected a JSON array of strings ` +
        `or an object with a "components" string array.`,
    );
  }
  return list as string[];
}

const exportedComponents = readExportedComponents();
const storiedComponents = readStoriedComponents();
const allowlist = readAllowlist();

const result = checkStoryCoverage({
  exportedComponents,
  storiedComponents,
  allowlist,
});

/* eslint-disable no-console */
console.log(
  `ui-react story coverage: ${
    exportedComponents.length - result.undocumented.length
  }/${exportedComponents.length} exported components documented ` +
    `(${allowlist.length} allowlisted).`,
);

if (result.undocumented.length > 0) {
  console.error(
    `\n✗ These exported ui-react components have no *.stories.tsx:\n` +
      result.undocumented.map(name => `    - ${name}`).join('\n') +
      `\n\n  Add a story next to each component, or (if it is intentionally not ` +
      `storied) add it to .storybook/story-coverage-allowlist.json with a reason.`,
  );
}

if (result.staleAllowlist.length > 0) {
  console.error(
    `\n✗ These allowlist entries no longer match any exported component:\n` +
      result.staleAllowlist.map(name => `    - ${name}`).join('\n') +
      `\n\n  Remove them from .storybook/story-coverage-allowlist.json.`,
  );
}

if (result.danglingStories.length > 0) {
  console.error(
    `\n✗ These stories have no matching exported ui-react component (dangling ` +
      `after a rename/removal?):\n` +
      result.danglingStories.map(name => `    - ${name}`).join('\n') +
      `\n\n  Remove the stale story, or re-export the component from ` +
      `plugins/ui-react/src/components/index.ts.`,
  );
}

if (result.redundantAllowlist.length > 0) {
  console.error(
    `\n✗ These allowlist entries are redundant — the component now has a story:\n` +
      result.redundantAllowlist.map(name => `    - ${name}`).join('\n') +
      `\n\n  Remove them from .storybook/story-coverage-allowlist.json.`,
  );
}

if (
  result.undocumented.length > 0 ||
  result.staleAllowlist.length > 0 ||
  result.danglingStories.length > 0 ||
  result.redundantAllowlist.length > 0
) {
  process.exit(1);
}

console.log('✓ Story coverage gate passed.');
/* eslint-enable no-console */
