import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * The order the suite runs its spec files in (`AGENTLAB_E2E_ORDER`).
 *
 * Playwright runs a project's files in the order of their paths, so a spec
 * that only passes after another one (an agent, a sign-in, a stored setting
 * that one leaves behind) goes unnoticed for as long as the files keep their
 * names. `shuffle` runs them in a random order, `shuffle:<seed>` in the order
 * an earlier run printed, so a failure is replayed as it happened.
 *
 * A shuffled run points the config's `testDir` at a directory of stubs, one
 * per spec, each importing its spec: `0042/agent-avatars.spec.ts` holds
 * `import '<e2e/agentlab>/agent-avatars.spec';`. Playwright orders the stubs
 * by their numbered directories and reports every test at its spec's own
 * path; the stub keeps the spec's file name, so the projects' `testMatch`
 * globs (`portalModes.ts`) select it as they select the spec. The workers are
 * the default run's: one admin page each, kept across the files.
 */
export type SpecOrder = { kind: 'default' } | { kind: 'shuffle'; seed: number };

/** Parses `AGENTLAB_E2E_ORDER`: unset or `default`, `shuffle`, `shuffle:<seed>`. */
export function parseSpecOrder(
  value: string | undefined,
  randomSeed: () => number = () => Math.floor(Math.random() * 2 ** 31),
): SpecOrder {
  if (!value || value === 'default') {
    return { kind: 'default' };
  }
  const match = /^shuffle(?::(\d+))?$/.exec(value);
  if (!match) {
    throw new Error(
      `AGENTLAB_E2E_ORDER=${value}: expected default, shuffle or shuffle:<seed>`,
    );
  }
  return {
    kind: 'shuffle',
    seed: match[1] === undefined ? randomSeed() : Number(match[1]),
  };
}

/** mulberry32: a small seeded generator, the same sequence for the same seed. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `items` in the seed's order (Fisher–Yates); the input is left as it is. */
export function shuffled<T>(items: readonly T[], seed: number): T[] {
  const random = seededRandom(seed);
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Writes the stubs of `specDir`'s `*.spec.ts` files in the seed's order into
 * `stubDir`, replacing what an earlier run left there, and returns `stubDir`.
 */
export function writeShuffledSpecs(
  specDir: string,
  stubDir: string,
  seed: number,
): string {
  const specs = readdirSync(specDir)
    .filter(name => name.endsWith('.spec.ts'))
    .sort();
  rmSync(stubDir, { recursive: true, force: true });
  shuffled(specs, seed).forEach((spec, index) => {
    const dir = join(stubDir, String(index).padStart(4, '0'));
    mkdirSync(dir, { recursive: true });
    const target = relative(dir, join(specDir, spec.replace(/\.ts$/, '')));
    writeFileSync(
      join(dir, spec),
      `// AGENTLAB_E2E_ORDER=shuffle:${seed}, position ${index}.\nimport '${target}';\n`,
    );
  });
  return stubDir;
}
