// Tests of the layout rules, on measurements shaped like collect.mjs's.
// Run with: node --test .agents/skills/layout-check/rules.test.mjs

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  alignmentRule,
  isWarning,
  notFoundOf,
  routeTemplateOf,
  warningCounts,
  centeringRule,
  checkLayout,
  clippedRule,
  formatFinding,
  overflowRule,
  overlapRule,
  rowsOf,
  shiftRule,
  isShortValue,
  tableFitRule,
  truncationRule,
} from './rules.mjs';

const layout = (overrides = {}) => ({
  viewport: { w: 375, h: 812 },
  scrollWidth: 375,
  items: [],
  centering: [],
  flexRows: [],
  truncated: [],
  cells: [],
  sticking: [],
  ...overrides,
});

let nextId = 1;
const item = (kind, rect, extra = {}) => ({
  id: nextId++,
  kind,
  role: kind === 'control' ? 'button' : kind,
  name: extra.name ?? kind,
  path: 'div > x',
  layer: 0,
  placed: 0,
  ancestors: [],
  rects: [rect],
  box: rect,
  pos: rect,
  key: extra.key ?? `k${nextId}`,
  inList: false,
  ...extra,
});

const box = (x, y, w, h) => ({ x, y, w, h });

test('overflow: a page wider than its viewport', () => {
  const findings = overflowRule(layout({ scrollWidth: 420 }));
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /420px wide in a 375px viewport/);
});

test('overflow: content cut off where the page does not scroll sideways', () => {
  const findings = overflowRule(layout({ scrollWidth: 963, viewport: { w: 768, h: 900 }, clipsX: true }));
  assert.match(findings[0].message, /the 195px on the right are cut off/);
});

test('overflow: a control sticking out where nothing scrolls', () => {
  const findings = overflowRule(
    layout({ sticking: [{ role: 'tab', name: 'Toolchains', path: 'a', box: box(360, 0, 80, 36) }] }),
  );
  assert.equal(findings.length, 1);
  assert.deepEqual(findings[0].elements[0].name, 'Toolchains');
});

test('overflow: none within the viewport', () => {
  assert.deepEqual(overflowRule(layout({ scrollWidth: 376 })), []);
});

test('overlap: a button running over the button beside it', () => {
  // giantswarm/backstage#3498: the toolchains button over its neighbours.
  const toolchains = item('control', box(33, 154, 280, 32), { name: 'Toolchains' });
  const start = item('control', box(300, 154, 60, 32), { name: 'Start' });
  const findings = overlapRule(layout({ items: [toolchains, start] }));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, 'overlap');
  assert.deepEqual(
    findings[0].elements.map(e => e.name),
    ['Toolchains', 'Start'],
  );
});

test('overlap: text running into an icon', () => {
  const icon = item('icon', box(26, 158, 24, 24));
  const text = item('text', box(41, 162, 264, 16));
  assert.equal(overlapRule(layout({ items: [icon, text] })).length, 1);
});

test('overlap: not between an element and what it contains', () => {
  const button = item('control', box(0, 0, 100, 32));
  const label = item('text', box(10, 8, 60, 16), { ancestors: [button.id] });
  // Not inside by the DOM, but inside by its box: an icon in a field.
  const icon = item('icon', box(80, 8, 16, 16));
  assert.deepEqual(overlapRule(layout({ items: [button, label, icon] })), []);
});

test('overlap: not across layers, nor with something placed over its neighbours', () => {
  const page = item('control', box(0, 0, 100, 32));
  const dialog = item('control', box(50, 10, 100, 32), { layer: 7 });
  const badge = item('text', box(90, -4, 16, 14), { placed: 9 });
  assert.deepEqual(overlapRule(layout({ items: [page, dialog, badge] })), []);
});

test('overlap: a touch target reaching a pixel or two over its neighbour', () => {
  const back = item('control', box(6, 6, 44, 44));
  const crumb = item('control', box(48, 20, 57, 17));
  assert.deepEqual(overlapRule(layout({ items: [back, crumb] })), []);
});

test('overlap: lines of text touching by their leading', () => {
  const heading = item('text', box(0, 0, 200, 24));
  const subtitle = item('text', box(0, 22, 200, 16));
  assert.deepEqual(overlapRule(layout({ items: [heading, subtitle] })), []);
});

test('rowsOf groups boxes that overlap vertically', () => {
  const rows = rowsOf([box(0, 0, 50, 32), box(60, 2, 50, 30), box(0, 40, 50, 32)]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].members.length, 2);
});

const control = (name, b) => ({ role: 'button', name, path: 'button', box: b });

test('alignment: a control between two rows of the filters beside it', () => {
  // giantswarm/backstage#3513: the filters wrap onto two rows and the
  // centred Sort picker sits halfway between them.
  const filters = {
    role: 'group',
    name: 'Filters',
    path: 'div',
    box: box(0, 0, 300, 72),
    controls: [
      control('Owner', box(0, 0, 140, 32)),
      control('Model', box(150, 0, 140, 32)),
      control('Status', box(0, 40, 140, 32)),
    ],
  };
  const sort = {
    role: 'div',
    name: 'Sort',
    path: 'div',
    box: box(320, 20, 147, 32),
    controls: [control('Sort agents', box(320, 20, 147, 32))],
  };
  const findings = alignmentRule(layout({ flexRows: [{ children: [filters, sort] }] }));
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /between two rows/);
  assert.equal(findings[0].elements[0].name, 'Sort agents');
});

test('alignment: top-aligned beside the first row is fine', () => {
  const filters = {
    role: 'group',
    name: 'Filters',
    path: 'div',
    box: box(0, 0, 300, 72),
    controls: [control('Owner', box(0, 0, 140, 32)), control('Status', box(0, 40, 140, 32))],
  };
  const sort = {
    role: 'div',
    name: 'Sort',
    path: 'div',
    box: box(320, 0, 147, 32),
    controls: [control('Sort agents', box(320, 0, 147, 32))],
  };
  assert.deepEqual(alignmentRule(layout({ flexRows: [{ children: [filters, sort] }] })), []);
});

test('alignment: a control aligned with none of its neighbour', () => {
  const a = { role: 'div', name: 'a', path: 'div', box: box(0, 0, 100, 32), controls: [control('A', box(0, 0, 100, 32))] };
  const b = { role: 'div', name: 'b', path: 'div', box: box(110, 5, 100, 36), controls: [control('B', box(110, 5, 100, 36))] };
  const findings = alignmentRule(layout({ flexRows: [{ children: [a, b] }] }));
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /off the row beside it/);
});

test('alignment: reported whatever the order of the two groups', () => {
  // One group's two like-sized buttons form one row (0..38); the other's
  // button lines up with that row's top, but the second button does not
  // line up with it.
  const a = {
    role: 'div',
    name: 'a',
    path: 'div',
    box: box(0, 0, 210, 38),
    controls: [control('a', box(0, 0, 100, 32)), control('b', box(110, 6, 100, 32))],
  };
  const b = { role: 'div', name: 'b', path: 'div', box: box(220, 0, 100, 32), controls: [control('c', box(220, 0, 100, 32))] };
  const forward = alignmentRule(layout({ flexRows: [{ children: [a, b] }] }));
  const backward = alignmentRule(layout({ flexRows: [{ children: [b, a] }] }));
  assert.equal(forward.length, backward.length);
  assert.ok(forward.length >= 1);
});

test('alignment: two single controls off each other are reported once', () => {
  const a = { role: 'div', name: 'a', path: 'div', box: box(0, 0, 100, 32), controls: [control('A', box(0, 0, 100, 32))] };
  const b = { role: 'div', name: 'b', path: 'div', box: box(110, 5, 100, 36), controls: [control('B', box(110, 5, 100, 36))] };
  assert.equal(alignmentRule(layout({ flexRows: [{ children: [a, b] }] })).length, 1);
});

test('alignment: a group spans down to the lowest bottom of its rows', () => {
  // Rows of 12..60 and 59..59.5 (they overlap by less than the tolerance,
  // so they are two): by the last row's bottom the group spans 0..59.5, by
  // the lowest bottom 0..60. A 72px group is a row of controls (60 + 12).
  const filters = {
    role: 'group',
    name: 'Filters',
    path: 'div',
    box: box(0, 0, 300, 72),
    controls: [
      control('Top', box(0, 0, 140, 10)),
      control('Tall', box(0, 12, 140, 48)),
      control('Thin', box(150, 59, 20, 0.5)),
    ],
  };
  const sort = { role: 'div', name: 'Sort', path: 'div', box: box(320, 17, 100, 48), controls: [control('Sort', box(320, 17, 100, 48))] };
  const findings = alignmentRule(layout({ flexRows: [{ children: [filters, sort] }] }));
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /5px off the row beside it/);
});

test('alignment: centred, top- or bottom-aligned controls of different heights are fine', () => {
  const a = { role: 'div', name: 'a', path: 'div', box: box(0, 0, 100, 32), controls: [control('A', box(0, 0, 100, 32))] };
  for (const y of [4, 0, 8]) {
    const b = { role: 'div', name: 'b', path: 'div', box: box(110, y, 100, 24), controls: [control('B', box(110, y, 100, 24))] };
    assert.deepEqual(alignmentRule(layout({ flexRows: [{ children: [a, b] }] })), [], `y=${y}`);
  }
});

test('alignment: a button beside a block of text and small links is not a row', () => {
  const header = {
    role: 'div',
    name: 'header',
    path: 'div',
    box: box(0, 8, 360, 48),
    controls: [control('title', box(0, 8, 120, 20)), control('owner', box(0, 35, 80, 17))],
  };
  const pin = { role: 'button', name: 'Pin', path: 'button', box: box(370, 16, 32, 32), controls: [control('Pin', box(370, 16, 32, 32))] };
  assert.deepEqual(alignmentRule(layout({ flexRows: [{ children: [header, pin] }] })), []);
});

test('alignment: a card whose button follows its text is not a row of controls', () => {
  const card = (x, y) => ({
    role: 'div',
    name: 'card',
    path: 'div',
    box: box(x, 0, 200, 160),
    controls: [control('Open', box(x + 10, y, 80, 32))],
  });
  assert.deepEqual(alignmentRule(layout({ flexRows: [{ children: [card(0, 100), card(210, 110)] }] })), []);
});

const truncated = (text, shown, needed, extra = {}) => ({
  role: 'span',
  name: text,
  path: 'span',
  box: box(0, 0, shown, 16),
  text,
  shown,
  needed,
  axis: 'x',
  ellipsis: true,
  fullText: false,
  fontSize: 14,
  ...extra,
});

test('truncation: text squeezed to a letter or two', () => {
  // giantswarm/giantswarm#39204: the agent's name shows 16 of 84px.
  const findings = truncationRule(layout({ truncated: [truncated('Review Agent', 16, 84)] }));
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /squeezed to 16 of the 84px/);
});

test('truncation: a text ending in an ellipsis, its full value on hover, is a design', () => {
  assert.deepEqual(
    truncationRule(
      layout({
        truncated: [
          truncated('OpenAI · gpt-4.1-mini · a long description', 167, 676, { fullText: true }),
        ],
      }),
    ),
    [],
  );
});

test('truncation: a text ending in an ellipsis with no title or tooltip is a warning', () => {
  const findings = truncationRule(
    layout({ truncated: [truncated('OpenAI · gpt-4.1-mini · a long description', 167, 676)] }),
  );
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /no title or tooltip/);
  assert.equal(findings[0].severity, 'warning');
});

test('truncation: squeezed to a letter or two, even with a tooltip', () => {
  const findings = truncationRule(
    layout({ truncated: [truncated('Review Agent', 16, 84, { fullText: true })] }),
  );
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /squeezed/);
  assert.equal(findings[0].severity, undefined);
});

test('truncation: a second line cut off by a box of fixed height', () => {
  const findings = truncationRule(
    layout({
      truncated: [truncated('Two lines of text', 20, 40, { axis: 'y', ellipsis: false })],
    }),
  );
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /without an ellipsis \(20 of 40px high shown\)/);
});

test('truncation: lines clamped with an ellipsis and a title', () => {
  assert.deepEqual(
    truncationRule(
      layout({
        truncated: [truncated('Three lines', 40, 60, { axis: 'y', ellipsis: true, fullText: true })],
      }),
    ),
    [],
  );
});

test('truncation: text cut off without an ellipsis', () => {
  const findings = truncationRule(
    layout({ truncated: [truncated('Recently added', 90, 120, { ellipsis: false })] }),
  );
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /without an ellipsis/);
});

test('truncation: a control cut off by an ancestor that hides its overflow', () => {
  const tab = item('control', box(0, 0, 64, 44), {
    box: box(-17, 0, 81, 44),
    clippedBy: { role: 'div', name: 'tabs', path: 'div.strip' },
  });
  const findings = clippedRule(layout({ items: [tab] }));
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /cut off by div\.strip/);
});

const centred = (content, extra = {}) => ({
  role: 'button',
  name: 'Sign in',
  path: 'button',
  box: box(0, 0, 96, 32),
  content,
  flow: { x: content.x, w: content.w },
  padding: { top: 0, right: 12, bottom: 0, left: 12 },
  centeredX: true,
  ...extra,
});

test('centering: text sitting high in its button', () => {
  // giantswarm/backstage#3518: the buttons were level with their labels,
  // their text sat too high inside them.
  const findings = centeringRule(layout({ centering: [centred(box(24, 4, 48, 16))] }));
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /4px above its centre/);
});

test('centering: content off-centre across in a control that centres it', () => {
  const findings = centeringRule(layout({ centering: [centred(box(16, 8, 48, 16))] }));
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /left of its centre/);
});

test('centering: centred content, and start-aligned content in a start-aligned control', () => {
  assert.deepEqual(centeringRule(layout({ centering: [centred(box(24, 8, 48, 16))] })), []);
  assert.deepEqual(
    centeringRule(layout({ centering: [centred(box(12, 8, 48, 16), { centeredX: false })] })),
    [],
  );
});

test('centering: asymmetric padding moves the centre with it', () => {
  // An icon-start button: 8px on the left, 16 on the right.
  const c = centred(box(8, 8, 64, 16), { padding: { top: 0, right: 16, bottom: 0, left: 8 }, box: box(0, 0, 96, 32) });
  // Inner box 8..80, its centre 44; the content's centre 40.
  assert.equal(centeringRule(layout({ centering: [c] })).length, 1);
  const ok = centred(box(12, 8, 64, 16), { padding: { top: 0, right: 16, bottom: 0, left: 8 }, box: box(0, 0, 96, 32) });
  assert.deepEqual(centeringRule(layout({ centering: [ok] })), []);
});

test('shift: a control that changes size and moves between states', () => {
  // giantswarm/backstage#3513: a longer Sort value widened the trigger.
  const before = layout({ items: [item('control', box(1109, 219, 123, 32), { key: 'sort', name: 'Sort agents' })] });
  const after = layout({ items: [item('control', box(1085, 219, 147, 32), { key: 'sort', name: 'Sort agents' })] });
  const findings = shiftRule(before, after);
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /moves by -24,0px and changes size from 123×32 to 147×32px/);
});

test('shift: moving down as the content above grows, rows of lists and overlays are fine', () => {
  const before = layout({
    items: [
      item('control', box(16, 400, 150, 32), { key: 'more' }),
      item('control', box(16, 500, 300, 40), { key: 'row', inList: true }),
      item('control', box(16, 100, 80, 32), { key: 'menu', layer: 3 }),
    ],
  });
  const after = layout({
    items: [
      item('control', box(16, 490, 150, 32), { key: 'more' }),
      item('control', box(40, 300, 280, 40), { key: 'row', inList: true }),
      item('control', box(60, 100, 120, 32), { key: 'menu', layer: 3 }),
    ],
  });
  assert.deepEqual(shiftRule(before, after), []);
});

test('checkLayout runs the chosen rules only', () => {
  const l = layout({ scrollWidth: 500, truncated: [truncated('x', 10, 80)] });
  assert.equal(checkLayout(l).length, 2);
  assert.deepEqual(
    checkLayout(l, ['overflow']).map(f => f.rule),
    ['overflow'],
  );
});

test('formatFinding names the page, width, scenario, state, elements and boxes', () => {
  const text = formatFinding({
    page: '/customize/agents',
    width: 768,
    scenario: 'base',
    state: 'Sort: Last used',
    rule: 'alignment',
    message: 'sits between two rows',
    elements: [
      { role: 'button', name: 'Sort agents', path: 'div > button', box: box(378, 20, 147, 32) },
      { role: 'group', name: 'Filters', path: 'div', box: box(77, 0, 293, 72) },
    ],
  });
  assert.match(text, /^alignment: \/customize\/agents @ 768px, scenario base, state "Sort: Last used"/);
  assert.match(text, /button "Sort agents" sits between two rows/);
  assert.match(text, /x=378 y=20 147×32/);
  assert.match(text, /group "Filters" \(div\) at x=77 y=0 293×72/);
});

test('warnings are told apart and counted by scenario', () => {
  const warning = { rule: 'truncation', severity: 'warning', scenario: 'many' };
  const finding = { rule: 'overlap', scenario: 'base' };
  assert.equal(isWarning(warning), true);
  assert.equal(isWarning(finding), false);
  assert.deepEqual(
    warningCounts([warning, { ...warning, scenario: 'base' }, warning]),
    [
      ['many', 2],
      ['base', 1],
    ],
  );
});

test('formatFinding marks a warning', () => {
  const text = formatFinding({
    page: '/customize/connectors',
    width: 1280,
    scenario: 'base',
    state: 'initial',
    rule: 'truncation',
    severity: 'warning',
    message: 'ends in an ellipsis with no title or tooltip holding the rest',
    elements: [{ role: 'span', name: 'Keeps the rowan catalogue', path: 'td > span', box: { x: 332, y: 388, w: 228, h: 17 } }],
  });
  assert.match(text, /^truncation \(warning\): \/customize\/connectors @ 1280px/);
});

test('routeTemplateOf refuses route templates and passes concrete paths', () => {
  assert.match(
    routeTemplateOf('/sessions/:installation/:sessionId'),
    /route template \(:installation\)/,
  );
  assert.match(routeTemplateOf('/*'), /route template \(\*\)/);
  assert.equal(routeTemplateOf('/customize/agents'), null);
  assert.equal(routeTemplateOf('/sessions/meadow/abc-123?tab=files'), null);
});

test('notFoundOf names the portal 404 page and a page\'s own not-found heading', () => {
  assert.equal(
    notFoundOf({
      errorPage: 'ERROR 404: PAGE NOT FOUND Looks like someone dropped the mic!',
      headings: ['Looks like someone dropped the mic!'],
    }),
    'the portal\'s "page not found" page',
  );
  assert.equal(
    notFoundOf({ errorPage: null, headings: ['Session', 'Session not found'] }),
    'the heading "Session not found"',
  );
  assert.equal(
    notFoundOf({ errorPage: null, headings: ['Customize', 'Last used by you'] }),
    null,
  );
  // Text about something else that was not found is no not-found page.
  assert.equal(
    notFoundOf({
      errorPage: null,
      headings: ['Why the connector you searched for was not found in this list'],
    }),
    null,
  );
});

const cell = (text, extra = {}) => ({
  role: 'gridcell',
  name: text,
  path: 'td.bui-TableCell > div > p',
  box: box(0, 0, 120, 40),
  table: 1,
  row: extra.row ?? 10,
  col: 2,
  column: 'Capacity',
  header: false,
  kind: 'leaf',
  text,
  status: false,
  lines: 1,
  cut: false,
  axis: 'x',
  needed: 100,
  shown: 100,
  fontSize: 14,
  ellipsis: false,
  fullText: false,
  ...extra,
});
const header = (text, extra = {}) =>
  cell(text, { role: 'columnheader', header: true, column: undefined, row: 1, ...extra });

test('isShortValue: dates, times, durations, ages, numbers, sizes, versions and their combinations', () => {
  for (const v of [
    '144 vCPUs · 1152 GiB',
    'Nov 12, 2026, 14:03',
    'Nov 12, 2026, 2:03 PM',
    '12 Nov',
    'Monday 14:03',
    '2026-11-12',
    '2026-11-12T14:03:05Z',
    '3 hours ago',
    'about 2 months ago',
    '1h 23m',
    '12',
    '42%',
    '$1,234.56',
    '$19.04/month',
    '21.6 GiB free',
    '16 GiB · 4 GPU',
    '3 runs · 4 minutes ago',
    '1.29.4',
    'v1.2.3-gs.1',
    '0.4.1, 0.3.0',
  ]) {
    assert.equal(isShortValue(v), true, v);
  }
});

test('isShortValue: names, labels, descriptions, IDs, URLs and paths are free text', () => {
  for (const v of [
    // Labels are short by where they sit (a badge), not by their words.
    'Not Ready',
    'In Progress',
    'Running',
    // A single-word name.
    'gazelle',
    'Bramble Clover',
    'Sage Basil 2',
    // A UUID starting with a digit, a name starting with one.
    '3f2a9c1e-58cc-4372-a567-0e02b2c3d479',
    '1password-connect',
    'https://api.example.io',
    '/var/lib/data',
    'gpu-pool-a',
    'Used by 3 agents',
    'downloading · 42 % · 6.7 GiB / 16.0 GiB',
    'Waits for the nightly build and reports what failed',
    '',
  ]) {
    assert.equal(isShortValue(v), false, v);
  }
});

test('table-fit: a short value cut off with an ellipsis, even with its value on hover', () => {
  // giantswarm/backstage#3564: the capacity of a cluster, every column on.
  const findings = tableFitRule(
    layout({
      cells: [cell('144 vCPUs · 1152 GiB', { cut: true, ellipsis: true, fullText: true, needed: 132, shown: 96 })],
    }),
  );
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, 'table-fit');
  assert.equal(findings[0].severity, undefined);
  assert.match(findings[0].message, /short value "144 vCPUs · 1152 GiB" in column "Capacity" is cut off with an ellipsis \(96 of 132px shown\)/);
});

test('table-fit: column headers cut off, with an ellipsis or without', () => {
  // giantswarm/backstage#3564: "Provider" and "Service priority".
  const findings = tableFitRule(
    layout({
      cells: [
        header('Provider', { col: 3, cut: true, ellipsis: true, fullText: true, needed: 58, shown: 41 }),
        header('Service priority', { col: 4, cut: true, needed: 110, shown: 70 }),
        header('Name', { col: 0 }),
      ],
    }),
  );
  assert.deepEqual(
    findings.map(f => f.message),
    [
      'column header "Provider" is cut off with an ellipsis (41 of 58px shown): a header always fits its column',
      'column header "Service priority" is cut off (70 of 110px shown): a header always fits its column',
    ],
  );
});

test('table-fit: a column header wrapping onto a second line', () => {
  const findings = tableFitRule(layout({ cells: [header('Service priority', { lines: 2 })] }));
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /column header "Service priority" wraps onto 2 lines/);
});

test('table-fit: a date wrapping onto a second line', () => {
  // giantswarm/backstage#3564: the Created column.
  const findings = tableFitRule(
    layout({ cells: [cell('Nov 12, 2026, 14:03', { column: 'Created', lines: 2 })] }),
  );
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /short value "Nov 12, 2026, 14:03" in column "Created" wraps onto 2 lines/);
});

test('table-fit: a value of several flex items wrapping as a whole', () => {
  // "144 vCPUs", "·" and "1152 GiB" as three spans of a wrapping flex row:
  // each is one line, the row is two.
  const findings = tableFitRule(
    layout({
      cells: [
        cell('144 vCPUs'),
        cell('·'),
        cell('1152 GiB'),
        cell('144 vCPUs · 1152 GiB', { kind: 'unit', lines: 2 }),
      ],
    }),
  );
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /"144 vCPUs · 1152 GiB" in column "Capacity" wraps onto 2 lines/);
});

test('table-fit: a status label is a short value whatever its words', () => {
  const findings = tableFitRule(
    layout({
      cells: [
        cell('Not Ready', { status: true, column: 'Status', lines: 2 }),
        cell('In Progress', { status: true, column: 'State', col: 3, cut: true, ellipsis: true, fullText: true }),
      ],
    }),
  );
  assert.equal(findings.length, 2);
});

test('table-fit: a date or a version in a link or a row header is still a short value', () => {
  const findings = tableFitRule(
    layout({ cells: [cell('v1.29.4', { role: 'rowheader', path: 'td > a', cut: true, ellipsis: true, fullText: true })] }),
  );
  assert.equal(findings.length, 1);
});

test('table-fit: one finding per column, counting rows, not pieces of text', () => {
  const findings = tableFitRule(
    layout({
      cells: [
        cell('Nov 12, 2026, 14:03', { column: 'Created', lines: 2, row: 11 }),
        // The same row's description wraps too: still one row.
        cell('3 hours ago', { column: 'Created', lines: 2, row: 11 }),
        cell('Nov 13, 2026, 09:12', { column: 'Created', lines: 2, row: 12 }),
        cell('Nov 14, 2026, 18:40', { column: 'Created', lines: 2, row: 13 }),
        cell('Nov 14, 2026, 18:40', { column: 'Created', lines: 2, table: 2 }),
      ],
    }),
  );
  assert.equal(findings.length, 2);
  assert.match(findings[0].message, /, and in 2 more rows:/);
  assert.doesNotMatch(findings[1].message, /more row/);
});

test('table-fit: long free text may wrap, and end in an ellipsis with its value on hover', () => {
  assert.deepEqual(
    tableFitRule(
      layout({
        cells: [
          cell('A very long agent name in the long-names scenario', { cut: true, ellipsis: true, fullText: true }),
          cell('Waits for the nightly build and reports what failed', { lines: 3 }),
          cell('gazelle', { cut: true, ellipsis: true, fullText: true }),
          cell('https://api.example.io/some/long/path', { cut: true, ellipsis: true, fullText: true }),
          cell('144 vCPUs · 1152 GiB'),
        ],
      }),
    ),
    [],
  );
});

test('table-fit: free text held to the truncation rule', () => {
  const findings = tableFitRule(
    layout({
      cells: [
        cell('Bramble Clover', { col: 0, cut: true, ellipsis: true, needed: 120, shown: 80 }),
        cell('Review Agent', { col: 1, cut: true, ellipsis: true, fullText: true, needed: 84, shown: 16 }),
        cell('Recently added', { col: 3, cut: true, needed: 120, shown: 90 }),
      ],
    }),
  );
  assert.deepEqual(
    findings.map(f => [f.severity, f.message]),
    [
      ['warning', '"Bramble Clover" in column "Capacity" ends in an ellipsis with no title or tooltip holding the rest (80 of 120px shown)'],
      [undefined, '"Review Agent" in column "Capacity" is squeezed to 16 of 84px shown'],
      [undefined, '"Recently added" in column "Capacity" is cut off without an ellipsis (90 of 120px shown)'],
    ],
  );
});

test('checkLayout: runs table-fit', () => {
  const findings = checkLayout(layout({ cells: [cell('12 GiB', { lines: 2 })] }));
  assert.deepEqual(findings.map(f => f.rule), ['table-fit']);
});
