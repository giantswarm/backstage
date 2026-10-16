import type { Locator, Page } from '@playwright/test';
import { expect, open, openReadyAgent, test } from './fixtures';

/**
 * Images in a session message: the home composer attaches a pasted image as a
 * removable thumbnail and refuses a dropped file that is not an image, saying
 * what it takes, or says the agent cannot take images when its model's
 * provider does not pass them; a session's transcript shows an image of the
 * person's message as a thumbnail that opens at full size.
 *
 * Whether the composer offers images follows the agent's ModelConfig
 * provider, and the lab's model may be one kagent sends no images (Ollama).
 * So the provider the portal reads is set at the browser for each test, and
 * nothing here sends an image to a model. The transcript's image is added to
 * the session's conversation read, in the shape kagent records a file part.
 */

/** A real 1×1 PNG. */
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

/**
 * Answers every ModelConfig read with `provider` as the model's provider: what
 * decides whether the composer offers images, whatever the lab runs.
 */
async function withModelProvider(page: Page, provider: string): Promise<void> {
  await page.route(
    url => /\/modelconfigs(\/|$)/.test(url.pathname),
    async route => {
      const response = await route.fetch();
      if (!response.ok()) {
        await route.fulfill({ response });
        return;
      }
      const body = (await response.json()) as {
        items?: { spec?: { provider?: string } }[];
        spec?: { provider?: string };
      };
      for (const item of body.items ?? [body]) {
        if (item.spec) {
          item.spec.provider = provider;
        }
      }
      await route.fulfill({ response, json: body });
    },
  );
}

/** Opens the home screen with the worker's agent chosen in the composer. */
async function openHomeWithAgent(
  page: Page,
  labAgent: { name: string },
): Promise<Locator> {
  await open(page, '/');
  await page
    .getByRole('button', { name: /(^| )Agent$/ })
    .first()
    .click();
  await page
    .getByRole('option', { name: new RegExp(labAgent.name) })
    .first()
    .click();
  const prompt = page.getByRole('textbox', { name: 'Prompt', exact: true });
  await prompt.click();
  return prompt;
}

/** Paste a PNG into the focused field, as a screenshot tool would. */
async function pasteImage(page: Page, name: string): Promise<void> {
  await page.evaluate(
    ({ base64, fileName }) => {
      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      const data = new DataTransfer();
      data.items.add(new File([bytes], fileName, { type: 'image/png' }));
      document.activeElement?.dispatchEvent(
        new ClipboardEvent('paste', {
          clipboardData: data,
          bubbles: true,
          cancelable: true,
        }),
      );
    },
    { base64: PNG_BASE64, fileName: name },
  );
}

/** Drag a file over `target` and let go of it there. */
async function dropFile(
  target: Locator,
  file: { name: string; type: string; text: string },
): Promise<void> {
  await target.evaluate((element, { name, type, text }) => {
    const data = new DataTransfer();
    data.items.add(new File([text], name, { type }));
    for (const kind of ['dragenter', 'dragover', 'drop']) {
      element.dispatchEvent(
        new DragEvent(kind, {
          dataTransfer: data,
          bubbles: true,
          cancelable: true,
        }),
      );
    }
  }, file);
}

/**
 * Answers the open session's conversation read with an image added to the
 * first message, as kagent records a file part of the person's message.
 */
async function withImageInFirstMessage(page: Page): Promise<void> {
  const sessionId = new URL(page.url()).pathname.split('/').pop();
  await page.route(
    url => url.pathname.endsWith(`/kagent/sessions/${sessionId}/tasks`),
    async route => {
      const response = await route.fetch();
      if (!response.ok()) {
        await route.fulfill({ response });
        return;
      }
      const body = (await response.json()) as {
        tasks?: { history?: { role?: string; parts?: unknown[] }[] }[];
      };
      const first = body.tasks?.[0]?.history?.find(
        message => message.role === 'ROLE_USER',
      );
      first?.parts?.push({
        raw: PNG_BASE64,
        mediaType: 'image/png',
        filename: 'e2e-sent.png',
      });
      await route.fulfill({ response, json: body });
    },
  );
}

async function deleteCurrentSession(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Session actions' }).click();
  await page.getByRole('menuitem', { name: /Delete session/ }).click();
  const dialog = page.getByRole('dialog', { name: /Delete session/ });
  await expect(dialog).toBeVisible();
  // Right after a turn kagent refuses the delete until the runtime's cleanup
  // settles; a person tries again a little later, and so does this.
  await expect
    .poll(
      async () => {
        if (!(await dialog.isVisible())) {
          return 'deleted';
        }
        await dialog
          .getByRole('button', { name: 'Delete session' })
          .click({ timeout: 5_000 })
          .catch(() => undefined);
        return 'refused';
      },
      { timeout: 120_000, intervals: [10_000] },
    )
    .toBe('deleted');
}

test('the home composer attaches pasted images and refuses other files', async ({
  admin,
  labAgent,
}) => {
  await openReadyAgent(admin, labAgent);
  await withModelProvider(admin, 'OpenAI');
  const prompt = await openHomeWithAgent(admin, labAgent);

  // Browsers call every pasted image `image.png`; the composer names it.
  await pasteImage(admin, 'image.png');
  const remove = admin.getByRole('button', {
    name: 'Remove Pasted image.png',
    exact: true,
  });
  await expect(remove).toBeVisible();
  await expect(prompt, 'the paste inserted no text').toHaveValue('');

  await remove.click();
  await expect(remove).toHaveCount(0);
  await expect(prompt, 'the focus went back to the prompt').toBeFocused();

  await dropFile(admin.getByTestId('composer-card'), {
    name: 'report.pdf',
    type: 'application/pdf',
    text: '%PDF-1.7',
  });
  await expect(
    admin.getByText(
      'report.pdf is not an image the agent can take. Attach a PNG, JPEG, GIF or WebP image.',
      { exact: true },
    ),
  ).toBeVisible();

  // A file let go of beside the box is refused, not opened in place of the
  // page.
  await dropFile(admin.locator('body'), {
    name: 'report.pdf',
    type: 'application/pdf',
    text: '%PDF-1.7',
  });
  await expect(admin, 'the drop did not open the file').toHaveURL(/\/$/);
});

test('the home composer says an agent whose model takes no images cannot take one', async ({
  admin,
  labAgent,
}) => {
  await openReadyAgent(admin, labAgent);
  await withModelProvider(admin, 'Ollama');
  await openHomeWithAgent(admin, labAgent);

  await pasteImage(admin, 'image.png');

  await expect(
    admin.getByText(
      `${labAgent.name} cannot take images: kagent does not pass images to Ollama models.`,
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    admin.getByRole('list', { name: 'Attached images', exact: true }),
  ).toHaveCount(0);
});

test('an image of the person’s message shows as a thumbnail that opens at full size', async ({
  admin,
  labAgent,
}) => {
  test.setTimeout(10 * 60_000);
  await openReadyAgent(admin, labAgent);
  await open(admin, '/');
  await admin
    .getByRole('button', { name: /(^| )Agent$/ })
    .first()
    .click();
  await admin
    .getByRole('option', { name: new RegExp(labAgent.name) })
    .first()
    .click();
  const prompt = admin.getByRole('textbox', { name: 'Prompt', exact: true });
  await prompt.fill('Answer with the word ready.');
  await admin.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(admin).toHaveURL(/\/sessions\/[^/]+\/[^/]+$/, {
    timeout: 60_000,
  });

  try {
    await expect(
      admin.getByTestId('timeline-agent-message').first(),
      'the turn finished',
    ).toBeVisible({ timeout: 180_000 });
    await withImageInFirstMessage(admin);
    await admin.reload();

    const enlarge = admin.getByRole('button', {
      name: 'Enlarge e2e-sent.png',
      exact: true,
    });
    await expect(enlarge).toBeVisible({ timeout: 60_000 });
    const thumbnail = await enlarge.boundingBox();
    expect(thumbnail!.height, 'a thumbnail, not the full image').toBeLessThan(
      200,
    );

    await enlarge.click();
    const dialog = admin.getByRole('dialog', { name: 'e2e-sent.png' });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole('img', { name: 'e2e-sent.png', exact: true }),
    ).toBeVisible();
    await admin.keyboard.press('Escape');
  } finally {
    await deleteCurrentSession(admin);
  }
});
