import { connectToMuster, expect, open, test } from './fixtures';
import { connectorRow } from './connectors';
import { signOutOfFixture } from './inboxSignIn';
import { lab } from './lab';

/**
 * Customize · Connectors at desktop width: a connector waiting for the
 * person's sign-in shows its state in Status and its Sign in in the column
 * after it, on one line, the button whole. The lab's `lab-oauth-fixture`,
 * signed out, is that connector.
 */
test('the Sign in sits beside "Sign in needed", in a column of its own', async ({
  admin,
}) => {
  test.setTimeout(240_000);
  await admin.setViewportSize({ width: 1440, height: 900 });
  const label = await signOutOfFixture(admin);

  await open(admin, `/customize/connectors?installation=${lab.installation}`);
  await connectToMuster(admin, admin.getByRole('grid'));

  const row = connectorRow(admin, label);
  const state = row.getByText('Sign in needed', { exact: true });
  await expect(state).toBeVisible({ timeout: 60_000 });
  const button = row.getByRole('button', { name: 'Sign in', exact: true });
  await expect(button).toBeVisible();

  // Their own cells, side by side.
  const cells = row.getByRole('gridcell');
  const cellCount = await cells.count();
  const texts = await Promise.all(
    Array.from({ length: cellCount }, (_, i) => cells.nth(i).innerText()),
  );
  const stateIndex = texts.findIndex(text => text.includes('Sign in needed'));
  expect(
    (
      await cells
        .nth(stateIndex + 1)
        .getByRole('button')
        .allInnerTexts()
    ).map(text => text.trim()),
    'the button is in the cell after the state',
  ).toEqual(['Sign in']);
  await expect(
    admin.getByRole('columnheader', { name: 'Actions' }),
    'the column has a header for a screen reader',
  ).toHaveCount(1);

  // On one line: the button to the right of the state, their middles level.
  const stateBox = await state.boundingBox();
  const buttonBox = await button.boundingBox();
  expect(stateBox).not.toBeNull();
  expect(buttonBox).not.toBeNull();
  expect(buttonBox!.x).toBeGreaterThan(stateBox!.x + stateBox!.width);
  expect(
    Math.abs(
      buttonBox!.y +
        buttonBox!.height / 2 -
        (stateBox!.y + stateBox!.height / 2),
    ),
  ).toBeLessThan(6);

  // Whole: neither the button nor its cell cuts the label off.
  const buttonCell = row.getByRole('gridcell').filter({ has: button });
  const clipped = await buttonCell.evaluate(cell => {
    const target = cell.querySelector('button');
    if (!target) {
      return true;
    }
    const cellBox = cell.getBoundingClientRect();
    const box = target.getBoundingClientRect();
    return (
      target.scrollWidth > target.clientWidth ||
      box.right > cellBox.right ||
      box.left < cellBox.left
    );
  });
  expect(clipped, 'the button fits its cell').toBe(false);
});
