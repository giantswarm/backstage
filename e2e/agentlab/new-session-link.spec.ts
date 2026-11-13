import type { Page } from '@playwright/test';
import { expect, open, test } from './fixtures';

/**
 * A new-session link, as an agent writes it into a reply: `/?agent=<id>#prompt=`
 * selects the agent and prefills the prompt, focused with the caret after the
 * text. Agents name the installation as agent-manager's `get_info` reports it,
 * which may differ from the portal's name for it, so the link's installation
 * here is one the portal does not know. Nothing is started.
 */

const PROMPT = 'Help me debug a cluster problem';
const agentWait = 2 * 60_000;

const prompt = (page: Page) => page.getByRole('textbox', { name: 'Prompt' });
const agentPicker = (page: Page) =>
  page.locator('button[aria-haspopup="listbox"]').first();

test('a new-session link selects its agent and puts the caret after its prompt', async ({
  admin,
  labAgent,
}) => {
  test.setTimeout(agentWait + 60_000);
  // `/customize/agents/<installation>/<namespace>/<name>`.
  const [, namespace, name] = labAgent.detailPath
    .replace(/^\/customize\/agents\//, '')
    .split('/');
  const ref = `not-the-portal-name/${namespace}/${name}`;

  await open(
    admin,
    `/?agent=${encodeURIComponent(ref)}#prompt=${encodeURIComponent(PROMPT)}`,
  );

  await expect(agentPicker(admin)).toContainText(labAgent.name, {
    timeout: agentWait,
  });
  await expect(prompt(admin)).toHaveValue(PROMPT);
  await expect(prompt(admin)).toBeFocused();
  expect(
    await prompt(admin).evaluate((field: HTMLTextAreaElement) => [
      field.selectionStart,
      field.selectionEnd,
    ]),
  ).toEqual([PROMPT.length, PROMPT.length]);
  await expect(admin.getByText('The linked agent is not selected')).toHaveCount(
    0,
  );
});

test('a new-session link to an unknown agent says so', async ({ admin }) => {
  test.setTimeout(agentWait + 60_000);
  await open(admin, `/?agent=${encodeURIComponent('kagent/no-such-agent')}`);

  await expect(admin.getByText('The linked agent is not selected')).toBeVisible(
    { timeout: agentWait },
  );
  await expect(
    admin.getByText(
      /^The link names the agent "kagent\/no-such-agent", which you cannot use here\./,
    ),
  ).toBeVisible();
});
