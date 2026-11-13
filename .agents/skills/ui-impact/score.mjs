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
// footprint from the block in an existing PR description instead, and warns
// when today's reach.tsv scores it differently. --sha is the PR's full head
// commit; it defaults to `git rev-parse HEAD`, with a warning when that isn't
// pushed. --print picks the output (default section). --body prints that PR
// description with its UI impact section replaced, or inserted when it has
// none.
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
// The heading as found in a description: any level, any case.
const HEADING_RE = /^#{1,6}\s+ui impact\s*$/i;
const ANY_HEADING_RE = /^#{1,6}\s/;
const FENCE_RE = /^\s*(```|~~~)/;
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
    if (!route?.startsWith('/') || !Object.hasOwn(LEVEL, reach)) {
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

const REGEX_CACHE = new Map();

/** A route template as a regex: each `:param` matches one path segment. */
export function routeRegex(template) {
  let re = REGEX_CACHE.get(template);
  if (!re) {
    re = compileRoute(template);
    REGEX_CACHE.set(template, re);
  }
  return re;
}

function compileRoute(template) {
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
  if (Object.hasOwn(routes, p)) return routes[p];
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
  const k = Object.hasOwn(KIND, fp.kind) ? KIND[fp.kind] : 0;
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
  if (!Object.hasOwn(KIND, fp.kind)) {
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
    if (typeof p?.path !== 'string' || !/^\/[^\s`]*$/.test(p.path)) {
      errors.push(
        `pages[${i}].path must be a route template starting with /, without spaces or backticks`,
      );
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

/**
 * The block's JSON, one line, safe inside an HTML comment. `result` is the
 * footprint's `score()`, computed once by the caller so the section and the
 * block can't disagree.
 */
export function blockJson(fp, sha, result) {
  const data = {
    v: 1,
    sha,
    score: result.score,
    reach: result.reach,
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
  // The escapes \u003c and \u003e read back as < and > in JSON.parse, and a
  // "-->" in a note can't end the comment early.
  return JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
}

export function block(fp, sha, result) {
  return `${BLOCK_PREFIX}${blockJson(fp, sha, result)} -->`;
}

/**
 * Free text for the visible section: one line, and a `<` outside code spans
 * as `&lt;`, so GitHub neither strips `<Badge>` nor opens a `<details>`.
 */
export function inline(text) {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(`[^`]*`)/)
    .map(part => (part.startsWith('`') ? part : part.replace(/</g, '&lt;')))
    .join('');
}

/** The visible section and the block, as markdown. */
export function section(fp, sha, routes) {
  const result = score(fp, routes);
  const { score: n, reach } = result;
  const lines = [HEADING, ''];
  if (n === 0) {
    lines.push(NO_CHANGE, '', block(fp, sha, result));
    return lines.join('\n');
  }
  if (n >= THRESHOLD) lines.push(TEST_NEEDED, '');
  const headline = inline(fp.headline).replace(/\.+$/, '');
  lines.push(
    `**Score ${n}** · reach: ${reach} · kind: ${fp.kind} · shows: ${inline(fp.when)}`,
    '',
    `**${headline}.** ${inline(fp.summary)}`,
    '',
    'Pages:',
    '',
    ...fp.pages.map(p => `- \`${p.path}\`: ${inline(p.note)}`),
    '',
    n >= THRESHOLD ? 'Test plan:' : 'How to check:',
    '',
    ...fp.check.map((step, i) => `${i + 1}. ${inline(step)}`),
    '',
    block(fp, sha, result),
  );
  return lines.join('\n');
}

/** Indexes of the lines outside fenced code blocks. */
function unfenced(lines) {
  const out = [];
  let fenced = false;
  for (const [i, l] of lines.entries()) {
    if (FENCE_RE.test(l)) fenced = !fenced;
    else if (!fenced) out.push(i);
  }
  return out;
}

const isBlock = l => l.trim().startsWith(BLOCK_PREFIX);

/**
 * Where a description's UI impact section is: its heading (-1 when it has
 * none) and its block (-1 when it has none). The block is the first one
 * after the heading, before any other heading; without a heading, the first
 * one in the description. Lines in fenced code (an example quoted in
 * "Changes") are never either.
 */
export function locate(lines) {
  const outside = unfenced(lines);
  const heading = outside.find(i => HEADING_RE.test(lines[i].trim())) ?? -1;
  let blockAt;
  if (heading >= 0) {
    const after = outside.filter(i => i > heading);
    const next = after.find(i => ANY_HEADING_RE.test(lines[i])) ?? Infinity;
    blockAt = after.find(i => i < next && isBlock(lines[i]));
  } else {
    blockAt = outside.find(i => isBlock(lines[i]));
  }
  return { heading, block: blockAt ?? -1 };
}

/** The footprint stored in a PR description's block, or null. */
export function readBlock(body) {
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  const at = locate(lines).block;
  if (at < 0) return null;
  const json = lines[at]
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
 * section runs from its heading (any level, any case) to its block. A
 * heading without a block yet (the template's placeholder) loses itself and
 * the paragraph right under it, nothing further, so text below the section
 * stays. A block without its heading is replaced in place. A description
 * with neither gets the section inserted before the first of INSERT_BEFORE,
 * or appended.
 */
export function replaceSection(body, sec) {
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  const { heading, block: at } = locate(lines);
  if (heading >= 0) {
    let end = at;
    if (end < 0) {
      end = heading;
      let i = heading + 1;
      while (i < lines.length && lines[i].trim() === '') i++;
      while (
        i < lines.length &&
        lines[i].trim() !== '' &&
        !ANY_HEADING_RE.test(lines[i])
      ) {
        end = i++;
      }
    }
    lines.splice(heading, end - heading + 1, ...sec.split('\n'));
    return lines.join('\n');
  }
  if (at >= 0) {
    lines.splice(at, 1, ...sec.split('\n'));
    return lines.join('\n');
  }
  const before = unfenced(lines).find(i =>
    INSERT_BEFORE.includes(lines[i].trim()),
  );
  if (before === undefined) return `${body.replace(/\s+$/, '')}\n\n${sec}\n`;
  lines.splice(before, 0, ...sec.split('\n'), '');
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

function git(...args) {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

/** The commit to record: --sha, or HEAD with a warning when it isn't pushed. */
function headSha(opts, warn) {
  let sha = opts.sha;
  if (!sha) {
    sha = git('rev-parse', 'HEAD');
    const upstream = git('rev-parse', '@{upstream}');
    if (!upstream) {
      warn(
        'HEAD has no upstream: pass the PR head with --sha "$(gh pr view <N> --json headRefOid -q .headRefOid)"',
      );
    } else if (upstream !== sha) {
      warn(
        `HEAD (${sha.slice(0, 9)}) isn't what is pushed (${upstream.slice(0, 9)}): push first, or pass the PR head with --sha`,
      );
    }
  }
  if (!/^[0-9a-f]{40}$/.test(sha ?? '')) {
    throw new Error(`--sha takes a full 40-character commit, got ${sha}`);
  }
  return sha;
}

function main(argv) {
  const opts = parseArgs(argv);
  const warn = msg => process.stderr.write(`score.mjs: warning: ${msg}\n`);
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
  const sha = headSha(opts, warn);
  const result = score(fp, routes);
  const { score: n, reach } = result;
  if (opts.reuse && typeof fp.score === 'number' && fp.score !== n) {
    const crossed = fp.score >= THRESHOLD !== n >= THRESHOLD;
    warn(
      `reach.tsv changed since the assessment: the score goes from ${fp.score} to ${n}${
        crossed
          ? `, across ${THRESHOLD}: ${n >= THRESHOLD ? 'add' : 'remove'} the ui-test-needed label`
          : ''
      }`,
    );
  }
  if (opts.body) {
    const sec = section(fp, sha, routes);
    process.stdout.write(replaceSection(readFileSync(opts.body, 'utf8'), sec));
  } else if (opts.print === 'score') {
    process.stdout.write(`${n}\t${reach}\n`);
  } else if (opts.print === 'block') {
    process.stdout.write(`${block(fp, sha, result)}\n`);
  } else {
    process.stdout.write(`${section(fp, sha, routes)}\n`);
  }
  process.stderr.write(
    `score ${n} (${reach})${n >= THRESHOLD ? ': the PR needs the ui-test-needed label' : ''}\n`,
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
