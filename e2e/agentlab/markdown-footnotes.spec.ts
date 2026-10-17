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

/**
 * The same on the template wizard, whose description and a step's note
 * (`GSStepLayout`'s `note`) are a template author's markdown. The lab's
 * catalog has no template with footnotes, so one is staged at the browser.
 */
const TEMPLATE = 'markdown-footnotes-e2e';
const PARAMETER_SCHEMA = {
  title: 'Markdown footnotes',
  description:
    'A template with a source.[^description]\n\n[^description]: The description’s own note.',
  steps: [
    {
      title: 'Details',
      schema: {
        type: 'object',
        'ui:ObjectFieldTemplate': 'GSStepLayout',
        'ui:options': {
          note: 'A step with a source.[^step]\n\n[^step]: The step’s own note.',
        },
        properties: { name: { type: 'string', title: 'Name' } },
      },
    },
  ],
};

for (const { where, id, text } of [
  {
    where: 'description',
    id: 'description',
    text: 'The description’s own note.',
  },
  { where: 'step note', id: 'step', text: 'The step’s own note.' },
]) {
  test(`a footnote in a template's ${where} jumps to its note in the page`, async ({
    admin,
  }) => {
    // The admin page is the worker's for every test: the staging leaves with it.
    const schemaUrl = `**/api/scaffolder/v2/templates/default/template/${TEMPLATE}/parameter-schema`;
    await admin.route(schemaUrl, route =>
      route.fulfill({ json: PARAMETER_SCHEMA }),
    );
    try {
      const templatePath = `/create/templates/default/${TEMPLATE}`;
      await admin.goto(templatePath);

      // Each document numbers its own footnotes from 1: the reference is found
      // by the note it links to.
      const reference = admin.locator(`a[href$="#user-content-fn-${id}"]`);
      await expect(reference).toBeVisible({ timeout: 60_000 });
      const note = admin.locator('li', { hasText: text });
      await expect(note).toHaveAttribute('id', `user-content-fn-${id}`);
      expect(fragmentOf(await reference.getAttribute('href'))).toBe(
        `user-content-fn-${id}`,
      );
      await expect(reference).not.toHaveAttribute('target');
      await expect(
        admin.locator('[id^="user-content-user-content-"]'),
      ).toHaveCount(0);

      await reference.click();
      await expect(note, 'the reference jumps to its note').toBeFocused();
      await expect(admin).toHaveURL(new RegExp(`${templatePath}$`));
    } finally {
      await admin.unroute(schemaUrl);
    }
  });
}
