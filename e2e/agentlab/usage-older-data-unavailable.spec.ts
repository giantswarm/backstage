import type { Page } from '@playwright/test';
import { expect, open, test } from './fixtures';

/**
 * A Mimir without a healthy store-gateway (giantswarm/giantswarm#39008): it
 * serves the last few hours from its ingesters, but fails every query that
 * needs older data, and the gs backend answers those 503 with
 * `error.reason: 'older_data_unavailable'`. The Usage screen then says that
 * older data is temporarily unavailable, in the words every Mimir figure
 * uses, instead of calling the environment unreachable.
 *
 * The lab's Mimir does not fail on demand, so the backend's answer is given
 * at the browser, the body exactly as `reportedErrorHandler()` sends it.
 */

const MIMIR_QUERIES = /\/api\/gs\/mimir\/query(_range)?\?/;

async function failMimirLikeAMissingStoreGateway(page: Page): Promise<void> {
  await page.route(MIMIR_QUERIES, async route => {
    await route.fulfill({
      status: 503,
      json: {
        error: {
          name: 'ServiceUnavailableError',
          message:
            'Mimir could not answer the query for installation "lab" (HTTP 500)',
          reason: 'older_data_unavailable',
          mimirError:
            'failed to get store-gateway replication set owning the block 01AAAAAAAAAAAAAAAAAAAAAAAA: at least 1 healthy replica required, could only find 0',
        },
        request: {
          method: 'GET',
          url: new URL(route.request().url()).pathname,
        },
        response: { statusCode: 503 },
      },
    });
  });
}

test.describe('Usage, while Mimir cannot read older data', () => {
  test('says older data is temporarily unavailable', async ({ admin }) => {
    await failMimirLikeAMissingStoreGateway(admin);
    try {
      await open(admin, '/usage');
      const olderData = admin.getByText(
        'Older data is temporarily unavailable',
        { exact: true },
      );
      const noObservability = admin.getByText(/has no observability stack/);
      await expect(olderData.or(noObservability).first()).toBeVisible();
      test.skip(
        await noObservability.isVisible(),
        'the lab has no observability stack (platform.observability: false)',
      );

      await expect(
        admin.getByText(/cannot read data older than a few hours/).first(),
      ).toBeVisible();
      // Not the reachability warning a failed read shows otherwise.
      await expect(
        admin.getByText(/Could not read \d+ environment/),
      ).toHaveCount(0);
    } finally {
      await admin.unroute(MIMIR_QUERIES);
    }
  });
});
