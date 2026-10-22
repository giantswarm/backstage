import { openDefaultModelWithContextWindows } from './context-windows.fixture';
import { expect, expectNoHorizontalScroll, signIn, test } from './fixtures';
import { lab } from './lab';

/**
 * A model's page on a phone: the context-window note, with its monospace
 * model id and config key, wraps inside the 375px page instead of pushing it
 * sideways.
 */
test('a model’s context-window note fits the phone', async ({ page }) => {
  await signIn(page, lab.users.admin);
  await openDefaultModelWithContextWindows(page, { 'no-such-model-*': 1 });
  const note = page.getByRole('note', { name: 'Context window', exact: true });
  await expect(note).toContainText(
    'No context window is configured for this model',
  );
  await expect(note).toBeInViewport();
  await expectNoHorizontalScroll(page, 'a model’s Overview with the note');
});
