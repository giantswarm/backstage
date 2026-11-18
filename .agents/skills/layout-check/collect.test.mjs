// Tests of the measurement, on small static pages in Playwright's Chromium:
// what a cell counts as used, text squeezed to no width, tables wider than
// their box. Run with: node --test .agents/skills/layout-check/collect.test.mjs
//
// They need the repository's dependencies and Chromium
// (`yarn playwright install chromium`), so they skip where those are
// missing, as in the skill-tests job, which installs nothing.

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { after, before, test } from 'node:test';

import { collectLayout } from './collect.mjs';
import { squeezedColumns, tableFitRule, tableScrollRule } from './rules.mjs';

const root = path.resolve(import.meta.dirname, '../../..');

let browser;
let missing;
try {
  const { chromium } = createRequire(path.join(root, 'package.json'))('@playwright/test');
  browser = await chromium.launch();
} catch (error) {
  missing = `no Playwright Chromium: ${String(error.message).split('\n')[0]}`;
}
const options = { skip: missing };

after(async () => browser?.close());

/**
 * A table of fixed column widths: `columns` is `[header, width, cell html]`,
 * the cell repeated in `rows` rows.
 */
const tablePage = (columns, rows = 3) => `<!doctype html>
<style>
  body { margin: 0; font: 14px/20px sans-serif; }
  table { table-layout: fixed; border-collapse: collapse; width: ${columns.reduce((w, c) => w + c[1], 0)}px; }
  th, td { padding: 0 8px; text-align: left; }
  .cut { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
</style>
<table>
  <colgroup>${columns.map(c => `<col style="width: ${c[1]}px">`).join('')}</colgroup>
  <thead><tr>${columns.map(c => `<th>${c[0]}</th>`).join('')}</tr></thead>
  <tbody>${Array.from({ length: rows }, () => `<tr>${columns.map(c => `<td>${c[2]}</td>`).join('')}</tr>`).join('')}</tbody>
</table>`;

async function measure(html, width = 1024) {
  const page = await browser.newPage({ viewport: { width, height: 800 } });
  await page.setContent(html);
  const layout = await page.evaluate(collectLayout, {});
  await page.close();
  return layout;
}

const squeezedName = ['Name', 60, '<span class="cut">Keeps the rowan catalogue in step with thyme</span>'];
const spareOf = (layout, column) =>
  Math.min(...layout.space.filter(s => s.column === column).map(s => s.inner - s.used));

test('a squeezed column beside a column of empty room is reported', options, async () => {
  const layout = await measure(tablePage([squeezedName, ['Notes', 200, 'Ok']]));
  assert.ok(spareOf(layout, 'Notes') > 100);
  assert.match(tableFitRule(layout)[0].message, /^column "Name" is squeezed until its text cannot be read/);
});

test('row actions shown on hover only take their room', options, async () => {
  const layout = await measure(
    tablePage([squeezedName, ['Actions', 200, '<button style="opacity: 0; width: 180px">Edit</button>']]),
  );
  assert.ok(spareOf(layout, 'Actions') < 24, `spare ${spareOf(layout, 'Actions')}`);
  assert.equal(squeezedColumns(layout).size, 0);
});

test('a progress bar takes its room', options, async () => {
  const bar =
    '<div role="progressbar" aria-valuenow="40" style="width: 180px; height: 4px; background: #ddd"><div style="width: 40%; height: 4px; background: #36c"></div></div>';
  const layout = await measure(tablePage([squeezedName, ['Progress', 200, bar]]));
  assert.ok(spareOf(layout, 'Progress') < 24, `spare ${spareOf(layout, 'Progress')}`);
  assert.equal(squeezedColumns(layout).size, 0);
});

test('a status dot counts as the cell\'s content', options, async () => {
  const status =
    '<div style="display: flex; justify-content: space-between"><span data-tone="ok" style="width: 8px; height: 8px; border-radius: 4px"></span><span>Ready</span></div>';
  const layout = await measure(tablePage([squeezedName, ['Status', 200, status]]));
  assert.ok(spareOf(layout, 'Status') < 24, `spare ${spareOf(layout, 'Status')}`);
  assert.equal(squeezedColumns(layout).size, 0);
});

test('a neighbour truncated by an inner box keeps the room it leaves', options, async () => {
  const description =
    '<span class="cut" style="max-width: 200px">A description far longer than the two hundred pixels it is shown in</span>';
  const layout = await measure(tablePage([squeezedName, ['Description', 400, description]]));
  assert.ok(spareOf(layout, 'Description') > 150, `spare ${spareOf(layout, 'Description')}`);
  assert.equal(squeezedColumns(layout).size, 1);
});

test('text squeezed to no width counts for a squeezed column, hidden text does not', options, async () => {
  // A flex item given no width by its row, as a column squeezed to nothing.
  const zero = (attributes = '') =>
    `<div style="display: flex"><span class="cut" style="flex: 0 1 0; min-width: 0" ${attributes}>Aster Hazel</span></div>`;
  const squeezed = await measure(tablePage([['N', 40, zero()], ['Notes', 300, 'Ok']]));
  assert.equal(squeezed.cells.filter(c => c.text === 'Aster Hazel').length, 0);
  assert.equal(squeezed.vanished.length, 3);
  const findings = tableFitRule(squeezed);
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /^column "N" is squeezed until its text cannot be read \("Aster Hazel" shows 0 of/);
  for (const hidden of [
    zero('aria-hidden="true"'),
    zero('data-layout-check="ignore"'),
    '<span class="cut" style="max-width: 0">Aster Hazel</span>',
    '<span style="position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0)">Aster Hazel</span>',
  ]) {
    const layout = await measure(tablePage([['N', 40, hidden], ['Notes', 300, 'Ok']]));
    assert.equal(layout.vanished.length, 0, hidden);
    assert.deepEqual(tableFitRule(layout), [], hidden);
  }
});

test('a table wider than its scroll box: its own width, not the box\'s content', options, async () => {
  const html = `<!doctype html><style>body { margin: 0; font: 14px sans-serif }</style>
<div style="width: 400px; overflow-x: auto; padding-right: 50px">
  <table style="width: 600px"><thead><tr><th>Name</th><th>Size</th></tr></thead>
  <tbody><tr><td>a</td><td>1 GiB</td></tr></tbody></table>
</div>`;
  const layout = await measure(html);
  assert.equal(layout.tableScrolls.length, 1);
  assert.equal(layout.tableScrolls[0].width, 600);
  assert.equal(
    tableScrollRule(layout)[0].message,
    '(columns "Name", "Size") scrolls sideways: 600px of table in a 450px box, 150px out of view',
  );
});

before(() => {
  if (missing) process.stderr.write(`collect.test.mjs: skipped, ${missing}\n`);
});
