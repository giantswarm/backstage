import type { Page } from '@playwright/test';
import { expect, open, test } from './fixtures';
import { lab } from './lab';

/**
 * The Agent Platform's old addresses (`/agent-platform/**` and the older
 * `/agents/**`) redirect until the end of 2026 (giantswarm/giantswarm#38510),
 * each in one hop to its place in the URL tree that follows the rail: a
 * connector's, tool's or workflow's `?installation=` moves into the path, and
 * the rest of the query stays.
 */

/**
 * Opens `from` and waits until it lands on `to`, recording every address the
 * page went through on the way: a one-hop redirect never shows one in
 * between.
 */
async function expectOneHop(page: Page, from: string, to: RegExp) {
  const seen: string[] = [];
  const record = (frame: { url(): string }) => {
    if (frame === page.mainFrame()) {
      const { pathname, search } = new URL(frame.url());
      seen.push(`${pathname}${search}`);
    }
  };
  page.on('framenavigated', record);
  try {
    await open(page, from);
    await expect(page).toHaveURL(to);
  } finally {
    page.off('framenavigated', record);
  }
  const between = seen.filter(address => address !== from && !to.test(address));
  expect(between, `${from} went through no other address`).toEqual([]);
}

const inst = lab.installation;

test.describe('an old Agent Platform address', () => {
  for (const [from, to] of [
    ['/agent-platform', /\/$/],
    ['/agent-platform/sessions', /\/sessions$/],
    ['/agent-platform/usage', /\/usage$/],
    ['/agent-platform/usage/cost', /\/usage\/cost$/],
    ['/agent-platform/profile', /\/profile$/],
    ['/agents', /\/customize\/agents$/],
    ['/agent-platform/agents/new', /\/customize\/agents\/new$/],
    ['/agent-platform/models', /\/customize\/models$/],
    ['/agent-platform/models/configs', /\/customize\/models$/],
    ['/agent-platform/models/serving', /\/customize\/models\/hosting$/],
    [
      '/agent-platform/models/capacity',
      /\/customize\/models\/hosting\/capacity$/,
    ],
    ['/agent-platform/skills', /\/customize\/skills$/],
    [
      `/agent-platform/connectors?installation=${inst}`,
      new RegExp(`/customize/connectors\\?installation=${inst}$`),
    ],
    [
      `/agent-platform/connectors/kubernetes?installation=${inst}`,
      new RegExp(`/customize/connectors/${inst}/kubernetes$`),
    ],
    [
      `/agent-platform/mcp-servers/muster/tools/core_mcpserver_list?installation=${inst}`,
      new RegExp(
        `/customize/connectors/${inst}/muster/tools/core_mcpserver_list$`,
      ),
    ],
    [
      `/agent-platform/workflows/lab-cluster-overview/run?installation=${inst}`,
      new RegExp(`/customize/workflows/${inst}/lab-cluster-overview/run$`),
    ],
  ] as const) {
    test(`${from} lands on its new address in one hop`, async ({ admin }) => {
      await expectOneHop(admin, from, to);
    });
  }
});
