import { join } from 'node:path';
import { defineConfig } from '@playwright/test';
import { chromiumLaunchOptions } from './browser';
import { contextOptions, lab, mobileContextOptions } from './lab';
import type { Variant } from './lab';
import { parseSpecOrder, writeShuffledSpecs } from './order';
import { mobileSpecGlobs, shellSpecGlobs } from './portalModes';

/**
 * The Dev Portal in a real browser against a running agentlab — see
 * `e2e/agentlab/README.md` for what it covers and how to run it.
 *
 * Nothing is started here: the lab is up already (`agentlab up`, or
 * `agentlab platform` after a dev-image swap), and the suite only drives its
 * Backstage. `yarn test:e2e:agentlab` runs it.
 */
// One id per run, which the workers inherit: the workspace fixtures name what
// they create with it, and remove what an aborted earlier run left (any other
// id) before they create anything.
process.env.AGENTLAB_E2E_RUN ??= Date.now().toString(36);

// The spec files' order (`order.ts`). The runner writes a shuffled run's
// stubs and pins its seed in the environment; the workers, which load this
// config again, inherit the seed and only read the stubs.
const order = parseSpecOrder(process.env.AGENTLAB_E2E_ORDER);
const REPO_ROOT = join(__dirname, '../..');
const ORDER_STUBS = join(REPO_ROOT, '.cache/e2e-agentlab-order');
if (order.kind === 'shuffle' && process.env.TEST_WORKER_INDEX === undefined) {
  process.env.AGENTLAB_E2E_ORDER = `shuffle:${order.seed}`;
  writeShuffledSpecs(__dirname, ORDER_STUBS, order.seed, REPO_ROOT);
  // eslint-disable-next-line no-console
  console.log(
    `Spec files in shuffled order; replay with AGENTLAB_E2E_ORDER=shuffle:${order.seed}`,
  );
}

export default defineConfig<{}, { variant: Variant }>({
  testDir: order.kind === 'shuffle' ? ORDER_STUBS : '.',
  // A page load in the lab can take a few seconds while the backend probes the
  // installation; a golden boot for a new agent takes minutes. The lifecycle
  // spec raises its own timeout.
  timeout: 90_000,
  expect: {
    timeout: 30_000,
  },

  // One worker by default: the lab's Backstage runs at the chart's default
  // memory limit. More sign in as lab users of their own, which the lab then
  // carries (`forWorker` in lab.ts, README's "How it signs in"). Each worker
  // signs in once and keeps that page (see fixtures.ts).
  workers: process.env.AGENTLAB_E2E_WORKERS
    ? Number(process.env.AGENTLAB_E2E_WORKERS)
    : 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,

  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: '../../e2e-test-report/agentlab' }],
  ],
  outputDir: '../../node_modules/.cache/e2e-agentlab-results',

  use: {
    ...contextOptions,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    // A network namespace of its own, so a container starting on the lab
    // machine does not abort the browser's requests (see browser.ts).
    launchOptions: chromiumLaunchOptions(),
  },

  // The classic portal's specs run against a lab in either portal mode; the
  // Agent Platform's only against one serving the shell
  // (`AGENTLAB_PORTAL_MODE=shell`, see `lab.ts` and `portalModes.ts`) — a
  // classic lab routes none of its pages.
  projects: [
    {
      name: 'agentlab',
      testIgnore: [...shellSpecGlobs, ...mobileSpecGlobs],
      use: { browserName: 'chromium' },
    },
    ...(lab.portalMode === 'shell'
      ? [
          {
            name: 'agentlab-shell',
            testMatch: shellSpecGlobs,
            use: { browserName: 'chromium' as const },
          },
          // The phone (`mobileContextOptions` in lab.ts): 375×812,
          // touch, an iPhone's user agent, on Chromium.
          {
            name: 'agentlab-mobile',
            testMatch: mobileSpecGlobs,
            use: {
              ...mobileContextOptions,
              browserName: 'chromium' as const,
              variant: 'mobile' as const,
            },
          },
        ]
      : []),
  ],
});
