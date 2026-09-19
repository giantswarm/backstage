import { expect, open, test } from './fixtures';

/**
 * The Serving page's listing order (giantswarm/backstage#2496): each
 * backend's table opens with the running models, then the ones that need
 * attention, then the ones not running. Read against the lab's own backends —
 * the host's models as model-manager lists them — with nothing stubbed and
 * nothing written: whatever states the lab happens to be in, the status words
 * down a table never fall back to an earlier tier.
 */

/** The tier of each status word — `SERVED_MODEL_READINESS_ORDER`, coarsened. */
const TIER: Record<string, number> = {
  Ready: 0,
  'Not serving': 1,
  'Not ready': 1,
  Pending: 1,
  Stopping: 1,
  Idle: 2,
  Downloading: 2,
  Available: 2,
};

const STATUS_WORD =
  /^(Ready|Not serving|Not ready|Pending|Stopping|Idle|Downloading|Available)\b/;

test('each backend lists the running models first, then the ones that need attention, then the ones not running', async ({
  admin,
}) => {
  await open(admin, '/agent-platform/models/serving');
  const grids = admin.getByRole('grid');
  await expect(
    grids.first(),
    'the lab serves at least one backend',
  ).toBeVisible();

  for (const grid of await grids.all()) {
    // Data rows carry the name as a row header; the header row does not.
    const rows = grid
      .getByRole('row')
      .filter({ has: admin.getByRole('rowheader') });
    const listed: { name: string; status: string }[] = [];
    for (const row of await rows.all()) {
      listed.push({
        name: (await row.getByRole('rowheader').innerText()).split('\n')[0],
        // The status cell follows the name; its first line is the word.
        status: (await row.getByRole('gridcell').first().innerText())
          .trim()
          .split('\n')[0],
      });
    }
    expect(listed.length, 'a backend with rows').toBeGreaterThan(0);

    const tiers = listed.map(({ status }) => {
      const word = status.match(STATUS_WORD)?.[1];
      expect(word, `a status word on "${status}"`).toBeDefined();
      return TIER[word!];
    });
    expect(
      listed.map(({ name, status }) => `${name}: ${status}`),
      'tiers never fall back down the table',
    ).toEqual(
      [...listed]
        .map((row, index) => ({ row, tier: tiers[index], index }))
        .sort((a, b) => a.tier - b.tier || a.index - b.index)
        .map(({ row }) => `${row.name}: ${row.status}`),
    );
  }
});
