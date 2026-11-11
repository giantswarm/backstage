#!/usr/bin/env node
// Scores a pull request's UI footprint and writes the "UI impact" section of
// its description: the visible section and the one-line machine-readable
// block. The footprint format and the rules are in SKILL.md; this file is the
// scoring's one implementation, and it gives the same scores as the triage
// that runs outside this repository.
//
//   node .claude/skills/ui-impact/score.mjs footprint.json [--sha SHA]
//     [--print section|block|score] [--body body.md] [--reach reach.tsv]
//   node .claude/skills/ui-impact/score.mjs --reuse body.md [--sha SHA] ...
//
// footprint.json is one footprint object, or `-` for stdin. --reuse takes the
// footprint from the block in an existing PR description instead. --sha
// defaults to `git rev-parse HEAD`. --print picks the output (default
// section). --body prints that PR description with its UI impact section
// replaced, or inserted when it has none.
//
// No dependencies, so it runs from the repo root without an install.

import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

export const REACH_FILE = join(HERE, 'reach.tsv');
export const KIND = {
  'new-flow': 4,
  behaviour: 3,
  layout: 2,
  wording: 1,
  none: 0,
};
export const LEVEL = { high: 3, medium: 2, low: 1 };
export const THRESHOLD = 6;
export const HEADING = '### UI impact';
export const BLOCK_PREFIX = '<!-- ui-impact ';
export const NO_CHANGE = 'No visible UI change.';
export const TEST_NEEDED = 'Manual UI test needed before merge.';

/** Reads reach.tsv (route, reach) into { "/route/template": level }. */
export function parseReach(text) {
  const routes = {};
  const lines = text.split('\n').filter(l => l.trim() !== '');
  const header = lines.shift()?.split('\t');
  if (!header || header[0] !== 'route' || header[1] !== 'reach') {
    throw new Error('reach.tsv: the header must be "route<TAB>reach"');
  }
  for (const [i, line] of lines.entries()) {
    const [route, reach] = line.split('\t');
    if (!route?.startsWith('/') || !(reach in LEVEL)) {
      throw new Error(
        `reach.tsv line ${i + 2}: want "/route<TAB>high|medium|low", got "${line}"`,
      );
    }
    routes[route] = LEVEL[reach];
  }
  return routes;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A route template as a regex: each `:param` matches one path segment. */
export function routeRegex(template) {
  const parts = (template.replace(/\/+$/, '') || '/').split(/(:[A-Za-z_]+)/);
  const body = parts
    .map(p => (p.startsWith(':') ? '[^/]+' : escapeRegExp(p)))
    .join('');
  return new RegExp(`^${body}/?$`);
}

/**
 * The reach level of one footprint path: the template it names, or the
 * highest of the templates it matches, either way round (a footprint path
 * may be concrete or a slightly different template). 0 when none matches.
 */
export function pathLevel(path, routes) {
  if (!path || !path.startsWith('/')) return 0;
  const p = path.split('?')[0].split('#')[0].trim();
  if (p in routes) return routes[p];
  let best = 0;
  for (const [tmpl, level] of Object.entries(routes)) {
    if (routeRegex(tmpl).test(p) || routeRegex(p).test(tmpl)) {
      best = Math.max(best, level);
    }
  }
  return best;
}

/** [level, label]: 3 every page or high, 2 medium, 1 low; conditional is low. */
export function reachLevel(fp, routes) {
  const shared = fp.shared ? ', shared' : '';
  if (fp.kind === 'none') return [0, '–'];
  if (fp.conditional) return [1, `low${shared}`];
  if (fp.shellWide) return [3, 'every page'];
  const level = Math.max(
    0,
    ...(fp.pages ?? []).map(p => pathLevel(p.path, routes)),
  );
  if (level >= 3) return [3, `high${shared}`];
  if (level === 2) return [2, `medium${shared}`];
  return [1, `low${shared}`];
}

/** Level × kind, +2 for a shared UI component; kind "none" scores 0. */
export function score(fp, routes) {
  const [level, reach] = reachLevel(fp, routes);
  const k = KIND[fp.kind] ?? 0;
  return {
    score: k === 0 ? 0 : level * k + (fp.shared ? 2 : 0),
    reach,
  };
}

/** The footprint's problems, as messages; empty when it is complete. */
export function validate(fp) {
  const errors = [];
  if (!fp || typeof fp !== 'object' || Array.isArray(fp)) {
    return ['the footprint must be one JSON object'];
  }
  if (!(fp.kind in KIND)) {
    errors.push(`kind must be one of ${Object.keys(KIND).join(', ')}`);
  }
  for (const key of ['shared', 'shellWide', 'conditional']) {
    if (typeof fp[key] !== 'boolean')
      errors.push(`${key} must be true or false`);
  }
  for (const key of ['headline', 'summary', 'when']) {
    if (typeof fp[key] !== 'string' || !fp[key].trim()) {
      errors.push(`${key} must be a non-empty string`);
    }
  }
  if (!Array.isArray(fp.pages)) errors.push('pages must be an array');
  if (!Array.isArray(fp.check)) errors.push('check must be an array');
  if (errors.length) return errors;
  for (const [i, p] of fp.pages.entries()) {
    if (typeof p?.path !== 'string' || !p.path.startsWith('/')) {
      errors.push(`pages[${i}].path must be a route template starting with /`);
    }
    if (typeof p?.note !== 'string' || !p.note.trim()) {
      errors.push(`pages[${i}].note must say what differs`);
    }
  }
  if (fp.check.some(s => typeof s !== 'string' || !s.trim())) {
    errors.push('check must hold non-empty strings');
  }
  if (fp.kind === 'none') {
    if (fp.pages.length) errors.push('kind "none" takes no pages');
  } else {
    if (!fp.pages.length) errors.push('a visible change names its pages');
    if (fp.check.length < 2 || fp.check.length > 4) {
      errors.push('a visible change takes 2 to 4 check steps');
    }
  }
  return errors;
}

/** The block's JSON, one line, safe inside an HTML comment. */
export function blockJson(fp, sha, routes) {
  const { score: n, reach } = score(fp, routes);
  const data = {
    v: 1,
    sha,
    score: n,
    reach,
    when: fp.when,
    kind: fp.kind,
    shared: fp.shared,
    shellWide: fp.shellWide,
    conditional: fp.conditional,
    pages: fp.pages.map(p => ({ path: p.path, note: p.note })),
    check: fp.check,
    headline: fp.headline,
    summary: fp.summary,
  };
  // < and > are the same characters to JSON.parse, and a "-->" in
  // a note can't end the comment early.
  return JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
}

export function block(fp, sha, routes) {
  return `${BLOCK_PREFIX}${blockJson(fp, sha, routes)} -->`;
}

/** The visible section and the block, as markdown. */
export function section(fp, sha, routes) {
  const { score: n, reach } = score(fp, routes);
  const lines = [HEADING, ''];
  if (n === 0) {
    lines.push(NO_CHANGE, '', block(fp, sha, routes));
    return lines.join('\n');
  }
  if (n >= THRESHOLD) lines.push(TEST_NEEDED, '');
  lines.push(
    `**Score ${n}** · reach: ${reach} · kind: ${fp.kind} · shows: ${fp.when}`,
    '',
    `**${fp.headline}.** ${fp.summary}`,
    '',
    'Pages:',
    '',
    ...fp.pages.map(p => `- \`${p.path}\`: ${p.note}`),
    '',
    n >= THRESHOLD ? 'Test plan:' : 'How to check:',
    '',
    ...fp.check.map((s, i) => `${i + 1}. ${s}`),
    '',
    block(fp, sha, routes),
  );
  return lines.join('\n');
}

/** The footprint stored in a PR description's block, or null. */
export function readBlock(body) {
  const line = body.split('\n').find(l => l.trim().startsWith(BLOCK_PREFIX));
  if (!line) return null;
  const json = line
    .trim()
    .slice(BLOCK_PREFIX.length)
    .replace(/\s*-->\s*$/, '');
  return JSON.parse(json);
}

// Headings the section goes before when the description has none: right
// after "Effect on end users", where the PR template puts it.
const INSERT_BEFORE = [
  '### Preview',
  '### Background and context',
  '### Ask to reviewers',
];

/**
 * The PR description with its UI impact section replaced by `sec`. The old
 * section runs from its heading to its block, or to the next heading when it
 * has no block yet (the template's placeholder). A description without one
 * gets it inserted before the first of INSERT_BEFORE, or appended.
 */
export function replaceSection(body, sec) {
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  const start = lines.findIndex(l => l.trim() === HEADING);
  if (start >= 0) {
    let end = lines.findIndex(
      (l, i) => i > start && l.trim().startsWith(BLOCK_PREFIX),
    );
    const next = lines.findIndex((l, i) => i > start && /^#{1,3} /.test(l));
    if (end < 0 || (next >= 0 && next < end)) {
      end = next < 0 ? lines.length : next - 1;
      while (end > start && lines[end]?.trim() === '') end--;
    }
    lines.splice(start, end - start + 1, ...sec.split('\n'));
    return lines.join('\n');
  }
  const at = lines.findIndex(l => INSERT_BEFORE.includes(l.trim()));
  if (at < 0) return `${body.replace(/\s+$/, '')}\n\n${sec}\n`;
  lines.splice(at, 0, ...sec.split('\n'), '');
  return lines.join('\n');
}

function parseArgs(argv) {
  const opts = { print: 'section' };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (['--sha', '--print', '--body', '--reach', '--reuse'].includes(a)) {
      if (i + 1 >= argv.length) throw new Error(`${a} takes a value`);
      opts[a.slice(2)] = argv[++i];
    } else if (a.startsWith('--')) {
      throw new Error(`unknown option ${a}`);
    } else {
      rest.push(a);
    }
  }
  if (!['section', 'block', 'score'].includes(opts.print)) {
    throw new Error('--print takes section, block or score');
  }
  if (rest.length > 1 || (rest.length === 1) === Boolean(opts.reuse)) {
    throw new Error('give one footprint file (or -), or --reuse body.md');
  }
  opts.footprint = rest[0];
  return opts;
}

function main(argv) {
  const opts = parseArgs(argv);
  const routes = parseReach(readFileSync(opts.reach ?? REACH_FILE, 'utf8'));
  let fp;
  if (opts.reuse) {
    fp = readBlock(readFileSync(opts.reuse, 'utf8'));
    if (!fp) throw new Error(`${opts.reuse} has no ui-impact block to reuse`);
  } else {
    const src = opts.footprint === '-' ? 0 : opts.footprint;
    fp = JSON.parse(readFileSync(src, 'utf8'));
  }
  const errors = validate(fp);
  if (errors.length) {
    throw new Error(`the footprint is incomplete:\n- ${errors.join('\n- ')}`);
  }
  const sha =
    opts.sha ??
    execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (!/^[0-9a-f]{7,40}$/.test(sha)) throw new Error(`not a commit: ${sha}`);
  const { score: n, reach } = score(fp, routes);
  if (opts.body) {
    const sec = section(fp, sha, routes);
    process.stdout.write(replaceSection(readFileSync(opts.body, 'utf8'), sec));
  } else if (opts.print === 'score') {
    process.stdout.write(`${n}\t${reach}\n`);
  } else if (opts.print === 'block') {
    process.stdout.write(`${block(fp, sha, routes)}\n`);
  } else {
    process.stdout.write(`${section(fp, sha, routes)}\n`);
  }
  process.stderr.write(
    `score ${n} (${reach})${n >= THRESHOLD ? ': add the ui-test-needed label' : ''}\n`,
  );
}

function isMain() {
  try {
    return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (isMain()) {
  try {
    main(process.argv.slice(2));
  } catch (e) {
    process.stderr.write(`score.mjs: ${e.message}\n`);
    process.exit(1);
  }
}
