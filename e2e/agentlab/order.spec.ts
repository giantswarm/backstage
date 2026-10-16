import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { parseSpecOrder, shuffled, writeShuffledSpecs } from './order';

/**
 * `AGENTLAB_E2E_ORDER` (order.ts) without a lab: the plain Playwright `test`,
 * not the suite's, whose fixtures sign in to one.
 */

test('AGENTLAB_E2E_ORDER parses to the default order, a fresh seed or the seed given', () => {
  expect(parseSpecOrder(undefined)).toEqual({ kind: 'default' });
  expect(parseSpecOrder('default')).toEqual({ kind: 'default' });
  expect(parseSpecOrder('shuffle', () => 7)).toEqual({
    kind: 'shuffle',
    seed: 7,
  });
  expect(parseSpecOrder('shuffle:1234')).toEqual({
    kind: 'shuffle',
    seed: 1234,
  });
  expect(() => parseSpecOrder('random')).toThrow(
    /expected default, shuffle or shuffle:<seed>/,
  );
});

test('one seed is one order of every item, another seed another', () => {
  const items = Array.from({ length: 40 }, (_, i) => `spec-${i}`);
  const first = shuffled(items, 42);
  expect(shuffled(items, 42)).toEqual(first);
  expect([...first].sort()).toEqual([...items].sort());
  expect(first).not.toEqual(items);
  expect(shuffled(items, 43)).not.toEqual(first);
  expect(items[0], 'the input keeps its order').toBe('spec-0');
});

test('the stubs import every spec once, in the seed’s order, under the spec’s own file name', () => {
  const root = mkdtempSync(join(tmpdir(), 'e2e-agentlab-order-'));
  const specDir = join(root, 'specs');
  const stubDir = join(root, 'stubs');
  const specs = ['a.spec.ts', 'b.spec.ts', 'c.spec.ts', 'd.spec.ts'];
  mkdirSync(specDir);
  for (const spec of [...specs, 'fixtures.ts', 'README.md']) {
    writeFileSync(join(specDir, spec), '');
  }

  writeShuffledSpecs(specDir, stubDir, 5);
  // A second run replaces the first one's stubs.
  writeShuffledSpecs(specDir, stubDir, 9);

  const positions = readdirSync(stubDir).sort();
  expect(positions).toEqual(['0000', '0001', '0002', '0003']);
  const order = positions.map(position => {
    const [stub] = readdirSync(join(stubDir, position));
    const source = readFileSync(join(stubDir, position, stub), 'utf8');
    expect(source).toContain(
      `import '../../specs/${stub.replace(/\.ts$/, '')}';`,
    );
    return stub;
  });
  expect(order).toEqual(shuffled(specs, 9));
  rmSync(root, { recursive: true, force: true });
});
