// node --test .claude/skills/ui-impact/score.test.mjs
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  NO_CHANGE,
  REACH_FILE,
  TEST_NEEDED,
  block,
  inline,
  parseReach,
  pathLevel,
  readBlock,
  reachLevel,
  replaceSection,
  routeRegex,
  score,
  section,
  validate,
} from './score.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, 'score.mjs');
const SHA = '0123456789abcdef0123456789abcdef01234567';
const SHA2 = 'fedcba9876543210fedcba9876543210fedcba98';

const ROUTES = parseReach(
  [
    'route\treach',
    '/\thigh',
    '/sessions/:installation/:sessionId\thigh',
    '/customize\tmedium',
    '/customize/models\tmedium',
    '/sessions\tlow',
    '/usage/cost\tlow',
    '',
  ].join('\n'),
);

function fp(overrides = {}) {
  return {
    headline: 'Larger rail text',
    summary: 'The side rail sets its session list in 12 px.',
    pages: [{ path: '/customize/models', note: 'namespace after the name' }],
    shared: false,
    shellWide: false,
    conditional: false,
    when: 'always',
    kind: 'layout',
    check: ['Open /customize/models.', 'Look at two rows with one name.'],
    ...overrides,
  };
}

const NONE = {
  headline: 'Skill docs only',
  summary: 'Nothing a user sees changes.',
  pages: [],
  shared: false,
  shellWide: false,
  conditional: false,
  when: 'never',
  kind: 'none',
  check: [],
};

test('the committed reach.tsv parses, with levels only', () => {
  const text = readFileSync(REACH_FILE, 'utf8');
  const routes = parseReach(text);
  assert.ok(Object.keys(routes).length > 50);
  assert.equal(routes['/'], 3);
  for (const line of text.trim().split('\n').slice(1)) {
    assert.match(line, /^\/\S*\t(high|medium|low)$/);
  }
});

test('parseReach refuses numbers and a missing header', () => {
  assert.throws(() => parseReach('route\treach\n/\t1200\n'), /line 2/);
  assert.throws(() => parseReach('/\thigh\n'), /header/);
  assert.throws(() => parseReach('route\treach\n/\ttoString\n'), /line 2/);
});

test('routeRegex matches one segment per parameter', () => {
  const re = routeRegex('/sessions/:installation/:sessionId');
  assert.ok(re.test('/sessions/golem/abc'));
  assert.ok(re.test('/sessions/golem/abc/'));
  assert.ok(!re.test('/sessions/golem'));
  assert.ok(!re.test('/sessions/golem/abc/def'));
  assert.ok(routeRegex('/').test('/'));
  assert.ok(routeRegex('/customize/skills/*').test('/customize/skills/*'));
  assert.ok(!routeRegex('/customize/skills/*').test('/customize/skills/x'));
});

test('pathLevel: exact, concrete, a different template, query, unknown', () => {
  assert.equal(pathLevel('/customize', ROUTES), 2);
  assert.equal(pathLevel('/sessions/golem/abc', ROUTES), 3);
  assert.equal(pathLevel('/sessions/:inst/:id', ROUTES), 3);
  assert.equal(pathLevel('/usage/cost?range=7d#top', ROUTES), 1);
  assert.equal(pathLevel('/not/a/page', ROUTES), 0);
  assert.equal(pathLevel('sessions', ROUTES), 0);
  assert.equal(pathLevel(undefined, ROUTES), 0);
});

test('reach: the highest page, every page, conditional and none', () => {
  assert.deepEqual(reachLevel(fp(), ROUTES), [2, 'medium']);
  assert.deepEqual(reachLevel(fp({ shared: true }), ROUTES), [
    2,
    'medium, shared',
  ]);
  const two = [
    { path: '/usage/cost', note: 'a' },
    { path: '/', note: 'b' },
  ];
  assert.deepEqual(reachLevel(fp({ pages: two }), ROUTES), [3, 'high']);
  assert.deepEqual(reachLevel(fp({ shellWide: true, shared: true }), ROUTES), [
    3,
    'every page',
  ]);
  assert.deepEqual(
    reachLevel(fp({ pages: two, conditional: true, shared: true }), ROUTES),
    [1, 'low, shared'],
  );
  assert.deepEqual(
    reachLevel(fp({ pages: [{ path: '/nowhere', note: 'x' }] }), ROUTES),
    [1, 'low'],
  );
  assert.deepEqual(reachLevel(NONE, ROUTES), [0, '–']);
});

test('score: level × kind, +2 shared, none is 0', () => {
  const cases = [
    [fp({ kind: 'new-flow' }), 8],
    [fp({ kind: 'behaviour' }), 6],
    [fp({ kind: 'layout' }), 4],
    [fp({ kind: 'wording' }), 2],
    [fp({ kind: 'wording', conditional: true }), 1],
    [fp({ kind: 'wording', conditional: true, shared: true }), 3],
    // #3468's shape: the side rail on every page, layout, shared.
    [fp({ shellWide: true, shared: true }), 8],
    [fp({ shellWide: true, kind: 'new-flow', shared: true }), 14],
    [{ ...NONE, shared: true, shellWide: true }, 0],
  ];
  for (const [f, want] of cases) assert.equal(score(f, ROUTES).score, want);
});

test('validate names what is missing', () => {
  assert.deepEqual(validate(fp()), []);
  assert.deepEqual(validate(NONE), []);
  assert.deepEqual(validate([fp()]), ['the footprint must be one JSON object']);
  assert.ok(validate(fp({ kind: 'big' })).some(e => e.startsWith('kind')));
  for (const kind of ['constructor', 'toString', '__proto__']) {
    assert.ok(validate(fp({ kind })).some(e => e.startsWith('kind')));
  }
  assert.ok(
    validate(fp({ pages: [{ path: '/a b', note: 'x' }] })).some(e =>
      e.startsWith('pages[0].path'),
    ),
  );
  assert.ok(validate(fp({ shared: 'yes' })).some(e => e.startsWith('shared')));
  assert.ok(validate(fp({ check: ['one'] })).some(e => /2 to 4/.test(e)));
  assert.ok(validate(fp({ pages: [] })).some(e => /names its pages/.test(e)));
  assert.ok(
    validate(fp({ pages: [{ path: 'models', note: 'x' }] })).some(e =>
      e.startsWith('pages[0].path'),
    ),
  );
  assert.ok(validate({ ...NONE, pages: fp().pages }).length > 0);
});

test('the block is one line of JSON that round-trips', () => {
  const f = fp({ summary: 'A note with --> and <b> in it.' });
  const line = block(f, SHA, score(f, ROUTES));
  assert.ok(!line.includes('\n'));
  assert.ok(line.startsWith('<!-- ui-impact {"v":1,"sha":"'));
  assert.ok(line.endsWith(' -->'));
  assert.equal(line.indexOf('-->'), line.length - 3);
  const data = readBlock(`text\n${line}\nmore`);
  assert.deepEqual(Object.keys(data), [
    'v',
    'sha',
    'score',
    'reach',
    'when',
    'kind',
    'shared',
    'shellWide',
    'conditional',
    'pages',
    'check',
    'headline',
    'summary',
  ]);
  assert.equal(data.sha, SHA);
  assert.equal(data.score, 4);
  assert.equal(data.reach, 'medium');
  assert.equal(data.summary, f.summary);
  assert.deepEqual(validate(data), []);
});

test('section: no visible change is one line and the block', () => {
  const sec = section(NONE, SHA, ROUTES);
  const lines = sec.split('\n');
  assert.equal(lines[0], '### UI impact');
  assert.equal(lines[2], NO_CHANGE);
  assert.equal(readBlock(sec).score, 0);
  assert.equal(lines.length, 5);
});

test('section: below 6 lists how to check, from 6 a test plan', () => {
  const low = section(fp(), SHA, ROUTES);
  assert.ok(!low.includes(TEST_NEEDED));
  assert.match(low, /\*\*Score 4\*\* · reach: medium · kind: layout/);
  assert.match(low, /How to check:\n\n1\. Open \/customize\/models\./);
  assert.match(low, /- `\/customize\/models`: namespace after the name/);

  const high = section(fp({ shellWide: true, shared: true }), SHA, ROUTES);
  assert.equal(high.split('\n')[2], TEST_NEEDED);
  assert.match(high, /Test plan:\n\n1\. /);
  assert.equal(readBlock(high).score, 8);
});

const TEMPLATE = [
  '### Rationale',
  '',
  'Why.',
  '',
  '### UI impact',
  '',
  '(Assess with the skill.)',
  '',
  '### Preview',
  '',
  'Pictures.',
].join('\n');

test('replaceSection fills the template placeholder', () => {
  const sec = section(NONE, SHA, ROUTES);
  const out = replaceSection(TEMPLATE, sec);
  assert.ok(!out.includes('(Assess with the skill.)'));
  assert.ok(out.includes(`${sec}\n\n### Preview`));
  assert.ok(out.startsWith('### Rationale\n\nWhy.\n\n### UI impact'));
});

test('replaceSection replaces an earlier assessment, heading to block', () => {
  const first = replaceSection(TEMPLATE, section(fp(), SHA, ROUTES));
  const again = replaceSection(
    first,
    section(fp({ kind: 'new-flow' }), SHA2, ROUTES),
  );
  assert.equal(again.match(/### UI impact/g).length, 1);
  assert.equal(again.match(/<!-- ui-impact /g).length, 1);
  assert.equal(readBlock(again).sha, SHA2);
  assert.equal(readBlock(again).score, 8);
  assert.ok(again.endsWith('### Preview\n\nPictures.'));
});

test('replaceSection inserts before Preview, or appends', () => {
  const sec = section(NONE, SHA, ROUTES);
  const noSection = '### Changes\n\nStuff.\n\n### Preview\n\nPics.';
  assert.equal(
    replaceSection(noSection, sec),
    `### Changes\n\nStuff.\n\n${sec}\n\n### Preview\n\nPics.`,
  );
  assert.equal(replaceSection('Just text.\n', sec), `Just text.\n\n${sec}\n`);
  const orphan = `### Changes\n\nStuff.\n\n${block(fp(), SHA, score(fp(), ROUTES))}\n\n### Preview`;
  const out = replaceSection(orphan, sec);
  assert.equal(out.match(/<!-- ui-impact /g).length, 1);
  assert.equal(readBlock(out).score, 0);
});

test('the command line: a file, stdin, --print, --body, --reuse', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ui-impact-'));
  try {
    const run = (args, input) =>
      execFileSync('node', [SCRIPT, ...args], {
        encoding: 'utf8',
        input,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    const file = join(dir, 'fp.json');
    writeFileSync(file, JSON.stringify(fp({ shellWide: true, shared: true })));
    assert.equal(
      run([file, '--sha', SHA, '--print', 'score']),
      '8\tevery page\n',
    );
    assert.equal(
      run(['-', '--sha', SHA, '--print', 'score'], JSON.stringify(NONE)),
      '0\t–\n',
    );
    assert.match(
      run([file, '--sha', SHA, '--print', 'block']),
      /^<!-- ui-impact \{.*\} -->\n$/,
    );

    const body = join(dir, 'body.md');
    writeFileSync(body, TEMPLATE);
    const filled = run([file, '--sha', SHA, '--body', body]);
    assert.equal(readBlock(filled).score, 8);
    writeFileSync(body, filled);
    const bumped = run(['--reuse', body, '--sha', SHA2, '--body', body]);
    assert.equal(readBlock(bumped).sha, SHA2);
    assert.equal(readBlock(bumped).score, 8);
    assert.equal(bumped.match(/<!-- ui-impact /g).length, 1);

    assert.throws(
      () => run([file, '--sha', 'HEAD~1']),
      e => /full 40-character commit/.test(e.stderr),
    );
    writeFileSync(file, JSON.stringify(fp({ check: [] })));
    assert.throws(
      () => run([file, '--sha', SHA]),
      e => /2 to 4 check steps/.test(e.stderr),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('section: free text renders as text, on one line', () => {
  assert.equal(
    inline('a <Badge> and\n`<Badge>` <details>'),
    'a &lt;Badge> and `<Badge>` &lt;details>',
  );
  const sec = section(
    fp({
      headline: 'Dots.',
      summary: 'Shows a <Badge>.',
      pages: [{ path: '/customize/models', note: 'two\nlines' }],
      check: ['Open <details>.', 'Look.'],
    }),
    SHA,
    ROUTES,
  );
  assert.match(sec, /\*\*Dots\.\*\* Shows a &lt;Badge>\./);
  assert.match(sec, /: two lines\n/);
  assert.match(sec, /1\. Open &lt;details>\./);
  assert.equal(readBlock(sec).summary, 'Shows a <Badge>.');
});

test('replaceSection finds the heading at any level and in any case', () => {
  const old = section(fp({ kind: 'new-flow' }), SHA, ROUTES).split('\n');
  for (const heading of ['## UI impact', '### UI Impact', '#### ui impact']) {
    old[0] = heading;
    const body = `### Changes\n\nStuff.\n\n${old.join('\n')}\n\n### Preview`;
    const out = replaceSection(body, section(NONE, SHA2, ROUTES));
    assert.ok(!/Score 8|Manual UI test/.test(out), heading);
    assert.equal(out.match(/ui impact$/gim).length, 1, heading);
    assert.equal(out.match(/<!-- ui-impact /g).length, 1, heading);
    assert.equal(readBlock(out).sha, SHA2);
  }
});

test('an example block in fenced code is neither read nor replaced', () => {
  const example = '```markdown\n<!-- ui-impact {"v":1,"kind":"none"} -->\n```';
  const real = section(fp(), SHA, ROUTES);
  const body = `### Changes\n\n${example}\n\n${real}\n\n### Preview`;
  assert.equal(readBlock(body).kind, 'layout');
  const out = replaceSection(body, section(NONE, SHA2, ROUTES));
  assert.ok(out.includes(example));
  assert.equal(readBlock(out).sha, SHA2);
  assert.equal(readBlock(out).kind, 'none');

  // Without a heading, a fenced example still isn't taken for the block.
  const noHeading = `### Changes\n\n${example}\n\nMore.\n\n### Preview`;
  assert.equal(readBlock(noHeading), null);
  const inserted = replaceSection(noHeading, section(NONE, SHA2, ROUTES));
  assert.ok(inserted.includes(example));
  assert.ok(inserted.includes(`More.\n\n### UI impact`));
});

test('the placeholder goes, text further down stays', () => {
  const body =
    '### Changes\n\nStuff.\n\n### UI impact\n\n(Placeholder\nover two lines.)\n\nCloses #123\n\n#### Notes\n\nKeep.';
  const out = replaceSection(body, section(NONE, SHA, ROUTES));
  assert.ok(!out.includes('Placeholder'));
  assert.ok(out.endsWith(`-->\n\nCloses #123\n\n#### Notes\n\nKeep.`));
  const bare = replaceSection(
    '### UI impact\n\n### Preview',
    section(NONE, SHA, ROUTES),
  );
  assert.ok(bare.endsWith('-->\n\n### Preview'));
});

test('--sha takes a full commit; --reuse warns when the score moved', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ui-impact-'));
  try {
    const run = args =>
      execFileSync('node', [SCRIPT, ...args], {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    const file = join(dir, 'fp.json');
    writeFileSync(file, JSON.stringify(fp()));
    assert.throws(
      () => run([file, '--sha', SHA.slice(0, 7)]),
      e => /full 40-character commit/.test(e.stderr),
    );

    // Assessed at medium (score 4), then /customize/models moves to high.
    const body = join(dir, 'body.md');
    writeFileSync(body, section(fp(), SHA, ROUTES));
    const reach = join(dir, 'reach.tsv');
    writeFileSync(reach, 'route\treach\n/customize/models\thigh\n');
    const out = execFileSync(
      'sh',
      [
        '-c',
        `node "${SCRIPT}" --reuse "${body}" --sha ${SHA2} --reach "${reach}" --print score 2>&1`,
      ],
      { encoding: 'utf8' },
    );
    assert.match(out, /^6\thigh$/m);
    assert.match(out, /from 4 to 6, across 6: add the ui-test-needed label/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
