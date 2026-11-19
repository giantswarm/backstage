import type { Page } from '@playwright/test';
import { expect, expectNoHorizontalScroll, open, test } from './fixtures';
import { skipWithoutModelManager } from './model-manager.fixture';

/**
 * Model hosting beside the side rail (layout check, giantswarm/backstage#3553):
 * at 768px a backend's card is about 424px wide, and its table of up to eight
 * columns squeezed every header and cell to a sliver and cut off the row's
 * actions. A table now takes its compact layout (stacked rows) wherever the
 * card is narrower than its columns need, and keeps the full table where they
 * fit. Read against the lab's own backends, nothing stubbed or written.
 */

// Model hosting is drawn only where model-manager answers.
skipWithoutModelManager();

/** Column headers whose label is cut: wider than the room it has. */
async function squeezedHeaders(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('[role="columnheader"]')]
      .filter(header => {
        const label = header.querySelector('span') ?? header;
        return (
          label.textContent?.trim() && label.scrollWidth > label.clientWidth + 1
        );
      })
      .map(header => header.textContent?.trim() ?? ''),
  );
}

test('Model hosting at tablet width lists models as stacked rows or tables that fit, and the full tables return on a wide window', async ({
  admin,
}) => {
  await admin.setViewportSize({ width: 768, height: 900 });
  await open(admin, '/customize/models/hosting');
  const backends = admin.getByRole('list', { name: /^Models on / });
  const tables = admin.getByRole('grid');
  await expect(
    backends.or(tables).first(),
    'the lab serves at least one backend',
  ).toBeVisible({ timeout: 60_000 });

  expect(await squeezedHeaders(admin), 'no column header cut at 768px').toEqual(
    [],
  );
  for (const backend of await backends.all()) {
    for (const row of await backend.getByRole('listitem').all()) {
      const actions = row.getByRole('button', { name: /^Actions for / });
      if (await actions.count()) {
        await expect(actions.first()).toBeInViewport({ ratio: 1 });
      }
    }
  }
  await expectNoHorizontalScroll(admin, 'Model hosting at 768px');

  await admin.setViewportSize({ width: 1440, height: 900 });
  await expect(tables.first()).toBeVisible();
  await expect(backends).toHaveCount(0);
  expect(
    await squeezedHeaders(admin),
    'no column header cut at 1440px',
  ).toEqual([]);
});

test('Hosting · Capacity at tablet width cuts no column header', async ({
  admin,
}) => {
  await admin.setViewportSize({ width: 768, height: 900 });
  await open(admin, '/customize/models/hosting/capacity');
  await expect(admin.getByText('GPU capacity')).toBeVisible({
    timeout: 60_000,
  });
  expect(await squeezedHeaders(admin)).toEqual([]);
  await expectNoHorizontalScroll(admin, 'Hosting · Capacity at 768px');
});
