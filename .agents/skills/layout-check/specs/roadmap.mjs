/*
 * The Roadmap pages, Hive's Roadmap tab, in any of fixture mode's scenarios:
 * the board, the team activity and an item's detail, with the board's filter
 * picker and a card's status menu open.
 *
 * Hive is off in fixture mode by default: turn it and its Roadmap tab on.
 *
 *   yarn fixtures start --enable page:plans --enable api:plans --enable page:roadmap --enable api:roadmap
 *   node .agents/skills/layout-check/layout-check.mjs --spec .agents/skills/layout-check/specs/roadmap.mjs
 *
 * A state whose card or picker a scenario lacks (no items in `empty`,
 * nothing at all in `loading` or `error`) is skipped, not failed; the item
 * page in `loading` and `error` is a base item's.
 */

const BOARD = '/hive/roadmap';

/** Whether `locator` shows up within `ms`. */
const shows = (locator, ms = 5000) =>
  locator
    .first()
    .waitFor({ timeout: ms })
    .then(
      () => true,
      () => false,
    );

/**
 * Opens the first item the board shows. In `loading` and `error` the board
 * shows none: open a base item, to see the item page's own state.
 */
const openFirstItem = async ({ page, scenario, skip }) => {
  if (scenario === 'loading' || scenario === 'error') {
    await page.goto(new URL(`${BOARD}/items/fixture-3297`, page.url()).href);
    return;
  }
  const item = page.locator(`a[href*="${BOARD}/items/"]`);
  if (!(await shows(item))) skip('no item on the board to open');
  const href = await item.first().getAttribute('href');
  await page.goto(new URL(href.split('?')[0], page.url()).href);
};

/** Opens the Kind filter's options. */
const kindPicker = {
  name: 'Kind picker open',
  run: async ({ page, skip }) => {
    const kind = page.getByRole('button', { name: /Kind/ });
    if (!(await shows(kind))) skip('no Kind filter: the board did not load');
    await kind.first().click();
    await page.getByRole('listbox').waitFor();
  },
  shift: false,
};

/** Opens the first card's status menu. */
const statusMenu = {
  name: 'status menu open',
  run: async ({ page, skip }) => {
    await page.keyboard.press('Escape');
    const button = page.getByRole('button', { name: 'Set status' });
    if (!(await shows(button))) skip('no card on the board');
    await button.first().click();
    await page.getByRole('menu').waitFor();
  },
  shift: false,
};

export default [
  {
    name: 'Roadmap board',
    path: BOARD,
    states: [kindPicker, statusMenu],
  },
  { name: 'Roadmap board, all teams', path: `${BOARD}?team=all` },
  { name: 'Roadmap team activity', path: `${BOARD}?view=activity` },
  { name: 'Roadmap item', path: BOARD, setup: openFirstItem },
];
