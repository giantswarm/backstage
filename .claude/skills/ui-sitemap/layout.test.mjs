// node --test .claude/skills/ui-sitemap/layout.test.mjs
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  SITEMAP_COLUMNS,
  STATE_COLUMNS,
  drawnRows,
  layout,
  levelSpec,
  parseTsv,
  planChanges,
  pngSize,
} from './layout.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

const tsv = (columns, rows) =>
  [columns, ...rows].map(row => row.join('\t')).join('\n');

const sitemap = rows => parseTsv(tsv(SITEMAP_COLUMNS, rows), SITEMAP_COLUMNS);

// id, parent, kind, name, path
const node = (id, parent, kind, path = '') => [id, parent, kind, id, path];

const SMALL = [
  node('home', '', 'page', '/'),
  node('sessions', 'home', 'page', '/sessions'),
  node('session', 'sessions', 'page', '/sessions/:installation/:id'),
  node('customize', 'home', 'tabs', '/customize'),
  node('agents', 'customize', 'tab', '/customize/agents'),
  node('agent', 'agents', 'page', '/customize/agents/:installation/:ns/:name'),
  node('update-skills', 'agent', 'dialog'),
  node('new-agent', 'agents', 'wizard', '/customize/agents/new'),
  node('details', 'new-agent', 'step', '/customize/agents/new'),
  node('tools', 'new-agent', 'step', '/customize/agents/new/tools'),
  node('skills', 'customize', 'tab', '/customize/skills'),
  node('profile', 'home', 'page', '/profile'),
];

const item = (plan, key) => {
  const found = plan.items.find(i => i.key === key);
  assert.ok(found, `no item ${key}`);
  return found;
};
const centre = box => box.x + box.width / 2;

/** A PNG's first 24 bytes: the signature and the start of IHDR. */
function pngHeader(width, height) {
  const buffer = Buffer.alloc(33);
  Buffer.from('89504e470d0a1a0a', 'hex').copy(buffer, 0);
  buffer.writeUInt32BE(13, 8);
  buffer.write('IHDR', 12, 'ascii');
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

test('reads the pixel size from a PNG header', () => {
  assert.deepEqual(pngSize(pngHeader(2880, 1800)), {
    width: 2880,
    height: 1800,
  });
  assert.throws(() => pngSize(Buffer.from('GIF89a and more bytes here')));
});

test('pads rows whose trailing empty cells were stripped', () => {
  const [row] = parseTsv(
    'id\tparent\tkind\tname\tpath\treach\tnote\nhome\t\tpage\tHome\t/',
    SITEMAP_COLUMNS,
  );
  assert.equal(row.note, '');
  assert.equal(row.path, '/');
  assert.throws(
    () => parseTsv('id\tkind\nhome\tpage', SITEMAP_COLUMNS),
    /header/,
  );
});

test('lays out the committed sitemap, the same every time', () => {
  const rows = parseTsv(
    readFileSync(join(HERE, 'sitemap.tsv'), 'utf8'),
    SITEMAP_COLUMNS,
  );
  const state = parseTsv(
    readFileSync(join(HERE, 'sitemap.state.tsv'), 'utf8'),
    STATE_COLUMNS,
  );
  const plan = layout({ rows, state });
  assert.deepEqual(layout({ rows, state }), plan);
  for (const row of rows) {
    assert.ok(item(plan, `${row.id}/card`));
  }
});

test('runs from the repo root', () => {
  const out = execFileSync(process.execPath, [join(HERE, 'layout.mjs')], {
    cwd: join(HERE, '../../..'),
    encoding: 'utf8',
  });
  assert.ok(JSON.parse(out).items.length > 0);
});

test('rows are top-aligned and a single child is centred under its parent', () => {
  const plan = layout({ rows: sitemap(SMALL) });
  const sessions = item(plan, 'sessions/card');
  const session = item(plan, 'session/card');
  assert.equal(centre(session), centre(sessions));
  for (const key of ['customize/card', 'profile/card']) {
    assert.equal(item(plan, key).y, sessions.y);
  }
  assert.ok(session.y > sessions.y + sessions.height);
});

test('places widths and label sizes by level', () => {
  const plan = layout({ rows: sitemap(SMALL) });
  assert.equal(item(plan, 'home/image').width, 1440);
  assert.equal(item(plan, 'sessions/image').width, 960);
  assert.equal(item(plan, 'agents/image').width, 960);
  assert.equal(item(plan, 'agent/image').width, 720);
  assert.equal(item(plan, 'agent/name').fontSize, 32);
  assert.equal(item(plan, 'agent/path').fontSize, 16);
  assert.equal(item(plan, 'agent/name').width, 720);
  assert.equal(levelSpec(7).width, 540);
});

test('tabs sit side by side in their group, without lines between them', () => {
  const plan = layout({ rows: sitemap(SMALL) });
  const group = item(plan, 'customize/card');
  const agents = item(plan, 'agents/card');
  const skills = item(plan, 'skills/card');
  assert.equal(group.type, 'group');
  assert.equal(agents.y, skills.y);
  assert.ok(agents.x + agents.width < skills.x);
  for (const tab of [agents, skills]) {
    assert.ok(tab.x > group.x && tab.x + tab.width < group.x + group.width);
    assert.ok(tab.y > group.y && tab.y + tab.height < group.y + group.height);
  }
  assert.equal(
    plan.items.find(i => i.key === 'skills/edge'),
    undefined,
  );
  assert.equal(item(plan, 'customize/edge').to, 'customize/card');
  assert.equal(item(plan, 'agent/edge').from, 'agents/card');
});

test('lines run elbowed from the parent bottom to the child top', () => {
  const plan = layout({ rows: sitemap(SMALL) });
  const edge = item(plan, 'agent/edge');
  const agents = item(plan, 'agents/card');
  const agent = item(plan, 'agent/card');
  assert.equal(edge.shape, 'elbowed');
  assert.equal(edge.strokeWidth, 4);
  assert.equal(edge.color, '#313131');
  assert.deepEqual(edge.points[0], [centre(agents), agents.y + agents.height]);
  assert.deepEqual(edge.points.at(-1), [centre(agent), agent.y]);
});

test('wizard steps are joined by arrows in order', () => {
  const plan = layout({ rows: sitemap(SMALL) });
  const edge = item(plan, 'tools/edge');
  assert.equal(edge.from, 'details/card');
  assert.equal(edge.to, 'tools/card');
  assert.equal(edge.fromSide, 'right');
  assert.equal(
    plan.items.find(i => i.key === 'details/edge'),
    undefined,
  );
  assert.equal(item(plan, 'new-agent/edge').from, 'agents/card');
});

test('a dialog sits beside its page on a dashed line', () => {
  const plan = layout({ rows: sitemap(SMALL) });
  const agent = item(plan, 'agent/card');
  const dialog = item(plan, 'update-skills/card');
  const edge = item(plan, 'update-skills/edge');
  assert.equal(dialog.y, agent.y);
  assert.ok(dialog.x > agent.x + agent.width);
  assert.equal(dialog.width, agent.width);
  assert.equal(edge.dashed, true);
  assert.equal(edge.label, 'Dialog');
});

test('sizes a screenshot from its PNG, else from the state viewport', () => {
  const rows = sitemap(SMALL);
  const state = [
    { id: 'profile', viewport: '1440x1800x2', card: 'c1', label: 'n1,p1' },
  ];
  const plan = layout({
    rows,
    state,
    screenSize: id =>
      id === 'home' ? { width: 2880, height: 4800 } : undefined,
  });
  const home = item(plan, 'home/image');
  assert.equal(home.height, 2400);
  assert.equal(home.file, 'screens/home.png');
  assert.equal(home.cy, home.y + 1200);
  const profile = item(plan, 'profile/image');
  assert.equal(profile.height, 1200);
  assert.equal(profile.file, null);
  assert.equal(item(plan, 'sessions/image').height, 600);
  assert.equal(item(plan, 'profile/card').miroId, 'c1');
  assert.equal(item(plan, 'profile/path').miroId, 'p1');
});

const CAPTURED = '2026-10-21T12:00:00Z';

/**
 * The state a completed run writes for a plan: a made-up Miro id per item,
 * the capture time and the viewport each image was sized by.
 */
function drawnState(plan) {
  const rows = new Map();
  const row = id =>
    rows.get(id) ??
    rows
      .set(id, {
        id,
        captured: '',
        viewport: '',
        card: '',
        image: '',
        label: '',
        edge: '',
      })
      .get(id);
  for (const i of plan.items) {
    const r = row(i.node ?? i.key);
    const id = `m:${i.key}`;
    if (i.type === 'image') {
      if (i.source === 'default' && !i.file) {
        continue;
      }
      r.image = id;
      r.captured = CAPTURED;
      r.viewport = `${i.pixelWidth / 2}x${i.pixelHeight / 2}x2`;
    } else {
      r[i.stateColumn] = r[i.stateColumn] ? `${r[i.stateColumn]},${id}` : id;
    }
  }
  return [...rows.values()];
}

/** What the CLI does: lay out, lay out the board as drawn, compare. */
function run({ rows, state = [], boardRows = rows, screenSize }) {
  const plan = layout({ rows, state, screenSize });
  const drawn = drawnRows(boardRows, state);
  const board = drawn.length > 0 ? layout({ rows: drawn, state }) : undefined;
  plan.changes = planChanges(plan, state, board);
  return plan;
}

test('a first run creates every item but the missing screenshots', () => {
  const { changes, items } = run({ rows: sitemap(SMALL) });
  const drawable = items.filter(i => i.type !== 'image');
  assert.deepEqual(changes.create.sort(), drawable.map(i => i.key).sort());
  assert.deepEqual(changes.update, []);
  assert.deepEqual(changes.delete, []);
  assert.ok(
    items.filter(i => i.type === 'image').every(i => i.action === 'none'),
  );
});

test('a run on an unchanged board keeps everything', () => {
  const rows = sitemap(SMALL);
  const state = drawnState(layout({ rows }));
  const { changes } = run({ rows, state });
  assert.deepEqual(changes, {
    create: [],
    update: [],
    replace: [],
    delete: [],
  });
});

test('a new node creates its items and moves only what it has to', () => {
  const state = drawnState(layout({ rows: sitemap(SMALL) }));
  const rows = sitemap([
    ...SMALL,
    node('settings', 'profile', 'page', '/profile/x'),
  ]);
  const { changes } = run({ rows, state });
  assert.deepEqual(changes.create.sort(), [
    'settings/card',
    'settings/edge',
    'settings/name',
    'settings/path',
  ]);
  // Everything left of the new node's subtree stays put.
  for (const id of ['sessions', 'session', 'customize', 'agents', 'agent']) {
    assert.ok(!changes.update.includes(`${id}/card`), id);
  }
  assert.deepEqual(changes.delete, []);
});

test('deletes every id the plan no longer has, level markers included', () => {
  const state = drawnState(layout({ rows: sitemap(SMALL) }));
  // Without the agents' subtrees the tree is a level shallower, and the
  // profile has lost its path.
  const rows = sitemap(
    SMALL.filter(
      ([id]) =>
        ![
          'agent',
          'update-skills',
          'new-agent',
          'details',
          'tools',
          'session',
        ].includes(id),
    ).map(r => (r[0] === 'profile' ? [...r.slice(0, 4), ''] : r)),
  );
  const { changes } = run({ rows, state });
  const deleted = changes.delete.map(d => d.miroId);
  for (const id of [
    'm:_level-2',
    'm:agent/card',
    'm:update-skills/edge',
    'm:tools/edge',
    'm:profile/path',
  ]) {
    assert.ok(deleted.includes(id), id);
  }
  assert.ok(!deleted.includes('m:profile/name'));
  assert.ok(!deleted.includes('m:_level-1'));
});

test('replaces a screenshot only when its PNG is newer than the capture', () => {
  const rows = sitemap(SMALL);
  const first = layout({
    rows,
    screenSize: () => ({ width: 2880, height: 1800, mtimeMs: 0 }),
  });
  const state = drawnState(first);
  const captured = Date.parse(CAPTURED);
  const png = mtimeMs => id => ({
    width: 2880,
    height: id === 'home' ? 4800 : 1800,
    mtimeMs: id === 'home' ? mtimeMs : captured - 1000,
  });
  const stale = run({ rows, state, screenSize: png(captured - 1000) });
  assert.deepEqual(stale.changes.replace, []);
  assert.equal(item(stale, 'home/image').file, null);
  const fresh = run({ rows, state, screenSize: png(captured + 1000) });
  assert.deepEqual(fresh.changes.replace, ['home/image']);
  assert.ok(fresh.changes.delete.some(d => d.miroId === 'm:home/image'));
  assert.ok(fresh.changes.update.includes('home/card'));
});

test('updates an item whose style or text changed', () => {
  const rows = sitemap(SMALL);
  const state = drawnState(layout({ rows }));
  // The board was drawn when "profile" had another name.
  const boardRows = rows.map(r =>
    r.id === 'profile' ? { ...r, name: 'Me' } : r,
  );
  const plan = run({ rows, state, boardRows });
  assert.deepEqual(plan.changes.update, ['profile/name']);
  const board = layout({ rows: drawnRows(rows, state), state });
  item(board, 'agent/edge').color = '#000000';
  const restyled = planChanges(layout({ rows, state }), state, board);
  assert.deepEqual(restyled.update, ['agent/edge']);
});

test('chains a page’s dialogs so no line crosses a card', () => {
  const plan = layout({
    rows: sitemap([...SMALL, node('change-harness', 'agent', 'dialog')]),
  });
  const first = item(plan, 'update-skills/card');
  const second = item(plan, 'change-harness/card');
  const edge = item(plan, 'change-harness/edge');
  assert.equal(edge.from, 'update-skills/card');
  assert.ok(second.x > first.x + first.width);
  assert.ok(
    edge.points.every(([x]) => x >= first.x + first.width && x <= second.x),
  );
});

test('a wizard arrow stays within both steps, and goes over a step’s dialog', () => {
  const tall = id =>
    id === 'tools' ? { width: 2880, height: 4800 } : undefined;
  const plan = layout({ rows: sitemap(SMALL), screenSize: tall });
  const details = item(plan, 'details/card');
  const [[, y]] = item(plan, 'tools/edge').points;
  assert.ok(y > details.y && y < details.y + details.height);

  const withDialog = layout({
    rows: sitemap([...SMALL, node('leave', 'details', 'dialog')]),
  });
  const edge = item(withDialog, 'tools/edge');
  const dialog = item(withDialog, 'leave/card');
  assert.equal(edge.fromSide, 'top');
  assert.equal(edge.toSide, 'top');
  assert.ok(edge.points.slice(1, -1).every(([, py]) => py < dialog.y));
});

test('runs through a symlink and reads only a PNG’s header', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ui-sitemap-'));
  try {
    symlinkSync(HERE, join(dir, 'skill'));
    writeFileSync(join(dir, 'home.png'), pngHeader(2880, 4800));
    utimesSync(join(dir, 'home.png'), new Date(), new Date());
    const out = execFileSync(
      process.execPath,
      [join(dir, 'skill', 'layout.mjs'), '--screens', dir],
      { cwd: dir, encoding: 'utf8' },
    );
    const plan = JSON.parse(out);
    assert.equal(item(plan, 'home/image').file, 'home.png');
    assert.equal(item(plan, 'home/image').height, 2400);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('rejects a sitemap that breaks the rules', () => {
  const bad = rows => () => layout({ rows: sitemap(rows) });
  assert.throws(
    bad([...SMALL, node('x', 'nowhere', 'page')]),
    /unknown parent/,
  );
  assert.throws(bad([...SMALL, node('x', 'home', 'tab')]), /cannot sit under/);
  assert.throws(bad([...SMALL, node('x', 'home', 'pages')]), /unknown kind/);
  assert.throws(bad([...SMALL, node('home', '', 'page')]), /used twice/);
  assert.throws(
    bad([...SMALL, node('x', 'home', 'page', '/a/<id>')]),
    /no < or >/,
  );
  assert.throws(
    bad([...SMALL, node('x', 'home', 'tabs')]),
    /needs at least one tab/,
  );
});

test('a dialog of a page with tabs sits beside the group box', () => {
  const rows = parseTsv(
    readFileSync(join(HERE, 'sitemap.tsv'), 'utf8'),
    SITEMAP_COLUMNS,
  );
  const plan = layout({ rows });
  const group = item(plan, 'agent/card');
  const dialog = item(plan, 'agent-update-skills/card');
  const edge = item(plan, 'agent-update-skills/edge');
  assert.equal(group.type, 'group');
  assert.equal(dialog.y, group.y);
  assert.ok(dialog.x > group.x + group.width);
  assert.equal(edge.from, 'agent/card');
  assert.equal(edge.label, 'Dialog');
});
