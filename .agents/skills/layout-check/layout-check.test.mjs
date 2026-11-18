// Tests of the command itself, the parts that need no browser.
// Run with: node --test .agents/skills/layout-check/layout-check.test.mjs

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { test } from 'node:test';

const command = path.join(import.meta.dirname, 'layout-check.mjs');

test('a route template as --page is refused with exit 2, before any portal is asked', () => {
  const result = spawnSync(
    process.execPath,
    [command, '--page', '/sessions/:installation/:sessionId', '--url', 'http://127.0.0.1:9'],
    { encoding: 'utf8' },
  );
  assert.equal(result.status, 2);
  assert.match(result.stderr, /\/sessions\/:installation\/:sessionId is a route template/);
});

test('the default widths include the laptop widths between tablet and 1280, and table-scroll is a rule', () => {
  const result = spawnSync(process.execPath, [command, '--help'], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /--widths <list> +viewport widths in px \(default 375,768,1024,1160,1280\)/);
  assert.match(result.stdout, /default all: [a-z,-]*table-scroll/);
});
