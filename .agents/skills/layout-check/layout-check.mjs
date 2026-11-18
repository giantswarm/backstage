#!/usr/bin/env node
/*
 * The layout check: opens portal pages in a headless Chromium of its own, at
 * several widths, in the fixture scenarios and the states a spec steps
 * through, measures every control, icon and line of text, and reports
 * overflow, overlaps, misaligned rows, truncation, controls that move or
 * resize between states and content off its control's centre. See SKILL.md.
 *
 *   node .agents/skills/layout-check/layout-check.mjs --page /customize/agents
 *   node .agents/skills/layout-check/layout-check.mjs --spec .agents/skills/layout-check/specs/agent-platform.mjs
 *
 * Exits 0 without findings, 1 with findings, 2 when it could not check (the
 * portal does not answer, a step failed, a page kept changing). Warnings are
 * reported in a section of their own and never change the exit code.
 */

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { collectLayout } from './collect.mjs';
import {
  RULES,
  checkLayout,
  collectPageKind,
  crashOf,
  formatFinding,
  isWarning,
  notFoundOf,
  routeTemplateOf,
  shiftRule,
  warningCounts,
} from './rules.mjs';

const root = path.resolve(import.meta.dirname, '../../..');

/**
 * A phone, a tablet or a narrow window, a small laptop, a laptop window a
 * little narrower than its screen, a laptop. From 600px the shell's side
 * rail is pinned open, so the content column is the width less the rail's.
 */
const DEFAULT_WIDTHS = [375, 768, 1024, 1160, 1280];

const USAGE = `Usage: layout-check.mjs [--page <path>]... [--spec <file.mjs>]... [options]

  --page <path>        a page to check in its initial state (repeatable)
  --spec <file.mjs>    pages with the states to step through (repeatable);
                       see SKILL.md for the format
  --only <text>        only the spec pages whose name or path contains it
  --widths <list>      viewport widths in px (default ${DEFAULT_WIDTHS.join(',')})
  --scenarios <list>   fixture scenarios, each added as ?fixtures=<name>
                       (default: none added, which is base)
  --rules <list>       rules to apply (default all: ${[...Object.keys(RULES), 'shift'].join(',')})
  --ignore <css>       leave out a subtree, on every page (repeatable)
  --url <url>          the portal (default: "url" in .fixtures-server.json)
  --concurrency <n>    pages checked at once (default 3)
  --json               the findings as JSON on stdout
`;

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

const list = value =>
  value === undefined
    ? undefined
    : value
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

const SETTLE_TIMEOUT_MS = 20000;


/**
 * The side rail pinned open, core-components' default, unless a step of the
 * spec changed it: the narrower content column, which is where tables
 * squeeze. Set before the portal's code runs, on every page load.
 */
function pinRailOpen() {
  try {
    if (window.localStorage.getItem('sidebarPinState') === null) {
      window.localStorage.setItem('sidebarPinState', 'true');
    }
  } catch {
    // Storage blocked: the portal's default, which is open too.
  }
}

/** How often a run keeps the fixture server it uses from stopping as idle. */
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Keeps this checkout's fixture server from stopping as idle while the run
 * measures it (`yarn fixtures touch`, which starts none): a full sweep runs
 * longer than the server's idle time. Returns the function that ends it.
 */
function keepFixtureServer() {
  const touch = () =>
    execFile(
      process.execPath,
      [path.join(root, 'scripts/fixtures-server.mjs'), 'touch'],
      { cwd: root },
      () => undefined,
    );
  touch();
  const timer = setInterval(touch, TOUCH_INTERVAL_MS);
  timer.unref();
  return () => clearInterval(timer);
}

function portalUrl(explicit) {
  if (explicit) return explicit.replace(/\/$/, '');
  const stateFile = path.join(root, '.fixtures-server.json');
  let state;
  try {
    state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  } catch {
    fail(
      `No ${path.relative(process.cwd(), stateFile) || stateFile}: start fixture mode with \`yarn fixtures start\`, or pass --url.`,
    );
  }
  if (!state.url) fail(`${stateFile} names no url.`);
  return state.url.replace(/\/$/, '');
}

/** Fails with one clear message when the portal does not answer. */
async function probe(baseUrl, explicit) {
  try {
    const response = await fetch(baseUrl, { signal: AbortSignal.timeout(10000) });
    if (response.ok) return;
    throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    fail(
      `The portal at ${baseUrl} does not answer (${error.cause?.code ?? error.message}). ${
        explicit
          ? 'Check --url.'
          : 'Start fixture mode with `yarn fixtures start`; `yarn fixtures status` says whether it runs.'
      }`,
    );
  }
}

/**
 * Waits until the page stops changing: no DOM mutation for `quietMs`, finite
 * animations done. Throws when it is still changing after `timeoutMs`: a
 * measurement taken mid-change would report what is only in passing.
 */
async function settle(page, { quietMs = 700, timeoutMs = SETTLE_TIMEOUT_MS } = {}) {
  await page
    .waitForLoadState('networkidle', { timeout: 5000 })
    .catch(() => undefined);
  const settled = await page.evaluate(
    ({ quietMs: quiet, timeoutMs: timeout }) =>
      new Promise(resolve => {
        const start = performance.now();
        let last = performance.now();
        const observer = new MutationObserver(() => {
          last = performance.now();
        });
        observer.observe(document, {
          subtree: true,
          childList: true,
          attributes: true,
          characterData: true,
        });
        const tick = () => {
          const now = performance.now();
          const running = document
            .getAnimations()
            .some(
              a =>
                a.playState === 'running' &&
                Number.isFinite(a.effect?.getComputedTiming().endTime),
            );
          if (now - last >= quiet && !running) {
            observer.disconnect();
            document.fonts.ready.then(() => resolve(true));
          } else if (now - start > timeout) {
            observer.disconnect();
            resolve(false);
          } else {
            setTimeout(tick, 100);
          }
        };
        tick();
      }),
    { quietMs, timeoutMs },
  );
  if (!settled) {
    throw new Error(
      `the page kept changing for ${timeoutMs / 1000}s (DOM mutations or animations), so it was not measured`,
    );
  }
}

function withScenario(url, scenario) {
  if (!scenario) return url;
  const u = new URL(url);
  u.searchParams.set('fixtures', scenario);
  return u.toString();
}

async function loadSpecs(files) {
  const specs = [];
  for (const file of files) {
    const mod = await import(pathToFileURL(path.resolve(file)).href);
    const pages = mod.default;
    if (!Array.isArray(pages)) {
      fail(`${file}: the default export must be an array of pages.`);
    }
    for (const p of pages) {
      if (!p.path) fail(`${file}: a page without a path.`);
      specs.push({ name: p.name ?? p.path, ...p, file });
    }
  }
  return specs;
}

async function checkOne(browser, baseUrl, job, options) {
  const { spec, width, scenario } = job;
  const label = {
    page: spec.name === spec.path ? spec.path : `${spec.name} (${spec.path})`,
    width,
    scenario: scenario ?? 'base',
  };
  const findings = [];
  const errors = [];
  const skipped = [];
  const ignore = [...options.ignore, ...(spec.ignore ?? [])];
  let state = 'load';
  let context;
  try {
    context = await browser.newContext({
      viewport: { width, height: width < 600 ? 812 : 900 },
      reducedMotion: 'reduce',
    });
    await context.addInitScript(pinRailOpen);
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    const step = {
      page,
      width,
      scenario: label.scenario,
      baseUrl,
      // Nothing to check here in this scenario (no record to open, no
      // picker on an empty list): the rest of this page is left out.
      skip: reason => {
        throw Object.assign(new Error(reason), { skip: true });
      },
    };
    // A path that names no page or record loads a not-found page, and a
    // page that threw shows the error panel: neither has the page's layout,
    // so it could not be checked, never a pass.
    const refuseNotFound = async ({ crashOnly = false } = {}) => {
      const kind = await page.evaluate(collectPageKind);
      const notFound = crashOnly ? null : notFoundOf(kind);
      if (notFound) throw new Error(`not found: ${spec.path} shows ${notFound}`);
      const crash = crashOf(kind);
      if (crash) throw new Error(`crashed: ${spec.path} shows ${crash}`);
    };
    await page.goto(withScenario(`${baseUrl}${spec.path}`, scenario));
    await settle(page);
    await refuseNotFound();
    if (spec.setup) {
      state = 'setup';
      await spec.setup(step);
      await settle(page);
      await refuseNotFound();
    }
    const states = [{ name: 'initial' }, ...(spec.states ?? [])];
    let previous;
    for (const s of states) {
      state = s.name;
      if (s.run) {
        await s.run(step);
        await settle(page);
        await refuseNotFound({ crashOnly: true });
      }
      const layout = await page.evaluate(collectLayout, {
        ignore: [...ignore, ...(s.ignore ?? [])],
      });
      const add = list =>
        findings.push(...list.map(f => ({ ...label, state: s.name, ...f })));
      add(checkLayout(layout, options.rules.filter(r => r in RULES)));
      if (previous && s.shift !== false && options.rules.includes('shift')) {
        add(shiftRule(previous, layout));
      }
      previous = layout;
    }
  } catch (error) {
    (error?.skip ? skipped : errors).push({
      ...label,
      state,
      message: String(error?.message ?? error).split('\n')[0],
    });
  } finally {
    await context?.close().catch(() => undefined);
  }
  return { findings, errors, skipped };
}

async function main() {
  let args;
  try {
    args = parseArgs({
      options: {
        page: { type: 'string', multiple: true },
        spec: { type: 'string', multiple: true },
        only: { type: 'string' },
        widths: { type: 'string' },
        scenarios: { type: 'string' },
        rules: { type: 'string' },
        ignore: { type: 'string', multiple: true },
        url: { type: 'string' },
        concurrency: { type: 'string' },
        json: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
      },
    }).values;
  } catch (error) {
    fail(`${error.message}\n\n${USAGE}`);
  }
  if (args.help) {
    process.stdout.write(USAGE);
    return 0;
  }
  const specs = [
    ...(args.page ?? []).map(p => ({ name: p, path: p })),
    ...(await loadSpecs(args.spec ?? [])),
  ].filter(
    s =>
      !args.only ||
      s.name.includes(args.only) ||
      s.path.includes(args.only),
  );
  if (specs.length === 0) fail(`Nothing to check.\n\n${USAGE}`);
  const templates = specs.map(s => routeTemplateOf(s.path)).filter(Boolean);
  if (templates.length) fail(templates.join('\n'));

  const widths = (list(args.widths) ?? DEFAULT_WIDTHS.map(String)).map(Number);
  if (widths.some(w => !Number.isInteger(w) || w < 200)) {
    fail(`--widths takes widths in px, 200 or more: ${args.widths}`);
  }
  const scenarios = list(args.scenarios) ?? [undefined];
  const rules = list(args.rules) ?? [...Object.keys(RULES), 'shift'];
  const unknown = rules.filter(r => !(r in RULES) && r !== 'shift');
  if (unknown.length) fail(`Unknown rules: ${unknown.join(', ')}`);
  const concurrency = Number(args.concurrency ?? 3);
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    fail(`--concurrency takes a whole number, 1 or more: ${args.concurrency}`);
  }
  const baseUrl = portalUrl(args.url);
  await probe(baseUrl, Boolean(args.url));
  const release = args.url ? () => undefined : keepFixtureServer();

  // Playwright from the repository's own dependencies; its Chromium is
  // installed by `yarn playwright install chromium`.
  const require = createRequire(path.join(root, 'package.json'));
  const { chromium } = require('@playwright/test');
  let browser;
  try {
    browser = await chromium.launch();
  } catch (error) {
    fail(
      `Could not start Playwright's Chromium (${String(error.message).split('\n')[0]}). Run \`yarn playwright install chromium\`.`,
    );
  }

  const jobs = specs.flatMap(spec =>
    (spec.widths ?? widths).flatMap(width =>
      scenarios.map(scenario => ({ spec, width, scenario })),
    ),
  );
  const options = { ignore: args.ignore ?? [], rules };
  const findings = [];
  const errors = [];
  const skipped = [];
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      const result = await checkOne(browser, baseUrl, job, options).catch(
        error => ({
          findings: [],
          errors: [
            {
              page: job.spec.name,
              width: job.width,
              scenario: job.scenario ?? 'base',
              state: 'load',
              message: String(error?.message ?? error).split('\n')[0],
            },
          ],
        }),
      );
      findings.push(...result.findings);
      errors.push(...result.errors);
      skipped.push(...(result.skipped ?? []));
      if (!args.json) {
        process.stderr.write(
          `checked ${job.spec.name} @ ${job.width}px${job.scenario ? ` (${job.scenario})` : ''}: ${result.findings.filter(f => !isWarning(f)).length} findings, ${result.findings.filter(isWarning).length} warnings${result.errors.length ? ', failed' : ''}\n`,
        );
      }
    }
  };
  try {
    await Promise.all(Array.from({ length: concurrency }, worker));
  } finally {
    release();
    await browser.close().catch(() => undefined);
  }

  const order = (a, b) =>
    a.page.localeCompare(b.page) ||
    a.width - b.width ||
    a.scenario.localeCompare(b.scenario);
  findings.sort(order);
  errors.sort(order);
  skipped.sort(order);
  // Warnings are reported apart and never fail the check.
  const warnings = findings.filter(isWarning);
  const failing = findings.filter(f => !isWarning(f));
  if (args.json) {
    process.stdout.write(
      `${JSON.stringify({ findings: failing, warnings, errors, skipped }, null, 2)}\n`,
    );
  } else {
    for (const f of failing) process.stdout.write(`${formatFinding(f)}\n\n`);
    if (warnings.length) {
      const counts = warningCounts(warnings)
        .map(([scenario, n]) => `${scenario} ${n}`)
        .join(', ');
      process.stdout.write(
        `Warnings (${warnings.length}: ${counts}), which do not fail the check:\n\n`,
      );
      for (const w of warnings) process.stdout.write(`${formatFinding(w)}\n\n`);
    }
    for (const e of errors) {
      process.stdout.write(
        `could not check: ${e.page} @ ${e.width}px, scenario ${e.scenario}, state "${e.state}": ${e.message}\n`,
      );
    }
    for (const e of skipped) {
      process.stdout.write(
        `skipped: ${e.page} @ ${e.width}px, scenario ${e.scenario}, state "${e.state}": ${e.message}\n`,
      );
    }
    process.stdout.write(
      `${failing.length} findings, ${warnings.length} warnings, ${errors.length} could not be checked, ${skipped.length} skipped, of ${jobs.length} page checks\n`,
    );
  }
  if (errors.length) return 2;
  return failing.length ? 1 : 0;
}

// Anything unexpected is "could not check", never a finding.
process.exitCode = await main().catch(error => {
  process.stderr.write(`${error?.stack ?? error}\n`);
  return 2;
});
