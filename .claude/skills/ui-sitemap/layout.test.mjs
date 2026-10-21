// node --test .claude/skills/ui-sitemap/layout.test.mjs
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  SITEMAP_COLUMNS,
  STATE_COLUMNS,
  diffPlans,
  layout,
  levelSpec,
  parseTsv,
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

test('a new node moves only what it has to', () => {
  const before = layout({ rows: sitemap(SMALL) });
  const after = layout({
    rows: sitemap([
      ...SMALL,
      node('settings', 'profile', 'page', '/profile/x'),
    ]),
  });
  const changes = diffPlans(before, after);
  assert.deepEqual(changes.added.sort(), [
    'settings/card',
    'settings/edge',
    'settings/image',
    'settings/name',
    'settings/path',
  ]);
  // Everything left of the new node's subtree stays put.
  for (const id of ['sessions', 'session', 'customize', 'agents', 'agent']) {
    assert.deepEqual(item(after, `${id}/card`), item(before, `${id}/card`));
  }
  assert.equal(changes.removed.length, 0);
});

test('lists state rows whose node is gone', () => {
  const plan = layout({
    rows: sitemap(SMALL),
    state: [
      { id: 'old-page', card: 'c9' },
      { id: '_title', label: 't1' },
    ],
  });
  assert.deepEqual(plan.removed, ['old-page']);
  assert.equal(item(plan, '_title').miroId, 't1');
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
