import { defineConfig } from '@playwright/test';
import { contextOptions, lab, mobileContextOptions } from './lab';
import type { Variant } from './lab';
import { mobileSpecGlobs, shellSpecGlobs } from './portalModes';

/**
 * The Dev Portal in a real browser against a running agentlab — see
 * `e2e/agentlab/README.md` for what it covers and how to run it.
 *
 * Nothing is started here: the lab is up already (`agentlab up`, or
 * `agentlab platform` after a dev-image swap), and the suite only drives its
 * Backstage. `yarn test:e2e:agentlab` runs it.
 */
export default defineConfig<{}, { variant: Variant }>({
  testDir: '.',
  // A page load in the lab can take a few seconds while the backend probes the
  // installation; a golden boot for a new agent takes minutes. The lifecycle
  // spec raises its own timeout.
  timeout: 90_000,
  expect: {
    timeout: 30_000,
  },

  // One worker: the lab's Backstage runs at the chart's default memory limit
  // and every worker would sign in as the same admin, whose muster session
  // the backend keeps server-side — parallel workers would see each other's
  // Connect to muster. The worker signs in once and keeps that page (see
  // fixtures.ts).
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
