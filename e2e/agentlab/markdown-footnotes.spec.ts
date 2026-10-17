import {
  createAgentInWizard,
  deleteAgentInPortal,
  expect,
  test,
} from './fixtures';

/**
 * Footnotes in rendered markdown, on the page that renders a person's own
 * markdown: an agent's instructions on its detail page (`GSMarkdownContent`).
 * A footnote reference links to its note and the note's back-reference to the
 * reference, each id carrying the sanitizer's `user-content-` prefix once, and
 * a click on either moves focus to the other.
 */

const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(4, 12);
const agentName = `E2E Footnotes ${stamp}`;
const agentSlug = `e2e-footnotes-${stamp}`;
const instructions = [
  'You are a test agent. Cite your sources.[^1]',
  '',
  '[^1]: The lab’s own answers.',
].join('\n');

const fragmentOf = (href: string | null) => href?.split('#')[1];

test('a footnote reference and its note link to each other', async ({
  admin,
}) => {
  test.setTimeout(6 * 60_000);

  const detailPath = await createAgentInWizard(admin, agentName, agentSlug, {
    onStep: async step => {
      if (step === 'Details') {
        await admin
          .getByRole('textbox', { name: 'Instructions' })
          .fill(instructions);
      }
    },
  });

  try {
    const reference = admin.getByRole('link', { name: '1', exact: true });
    await expect(reference).toBeVisible({ timeout: 60_000 });
    const note = admin.locator('li', { hasText: 'The lab’s own answers.' });
    const backReference = note.getByRole('link', { name: 'Back to content' });

    await expect(note).toHaveAttribute('id', 'user-content-fn-1');
    await expect(reference).toHaveAttribute('id', 'user-content-fnref-1');
    expect(fragmentOf(await reference.getAttribute('href'))).toBe(
      'user-content-fn-1',
    );
    expect(fragmentOf(await backReference.getAttribute('href'))).toBe(
      'user-content-fnref-1',
    );
    await expect(
      admin.locator('[id^="user-content-user-content-"]'),
    ).toHaveCount(0);

    await reference.click();
    await expect(note, 'the reference jumps to its note').toBeFocused();
    await backReference.click();
    await expect(
      reference,
      'the back-reference jumps to its reference',
    ).toBeFocused();
    await expect(admin).toHaveURL(new RegExp(`${detailPath}$`));
  } finally {
    await deleteAgentInPortal(admin, detailPath, agentSlug);
  }
});
