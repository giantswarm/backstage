import type { Page } from '@playwright/test';
import {
  expect,
  expectNoHorizontalScroll,
  expectWizardStep,
  fillAgentDetails,
  open,
  test,
} from './fixtures';

/**
 * The New agent wizard's Tools step between tablet and laptop widths (T81):
 * the *Selected* rail docks right of the step only where the step keeps its
 * 400px column beside it, and the *Selected so far* bar stands in for it
 * otherwise — never both, never neither, never a page that scrolls sideways.
 * With the shell's rail expanded (224px) a 768px window leaves the step too
 * little room to dock; 1280px leaves plenty.
 */

async function reachTools(page: Page) {
  await open(page, '/customize/agents/new');
  await fillAgentDetails(page, {
    name: 'E2E Rail Docking',
    description: 'Layout check of the Playwright suite; never created.',
    instructions: 'You are a test agent.',
  });
  await page.getByRole('button', { name: 'Continue' }).first().click();
  await expectWizardStep(page, 'Skills');
  await page.getByRole('button', { name: 'Continue' }).first().click();
  await expectWizardStep(page, 'Tools');
}

async function chooseCustomTools(page: Page) {
  await page
    .getByRole('radio', { name: 'Nothing outside the chat', exact: true })
    .check();
  await page
    .getByRole('radio', { name: 'Only the tools I choose below', exact: true })
    .check();
  const individual = page.getByRole('button', {
    name: 'Choose individual tools instead',
    exact: true,
  });
  if (await individual.isVisible()) await individual.click();
  await openSelectorInput(page);
}

async function openSelectorInput(page: Page) {
  if (
    !(await page
      .getByRole('textbox', { name: 'Selector', exact: true })
      .isVisible())
  ) {
    await page.getByText('Add a selector by name', { exact: true }).click();
  }
}

async function addSelector(page: Page, selector: string) {
  await page
    .getByRole('textbox', { name: 'Selector', exact: true })
    .fill(selector);
  await page.getByRole('button', { name: 'Add selector', exact: true }).click();
}

test('toolset boundaries accept 128 selectors and refuse 129', async ({
  admin,
}) => {
  test.setTimeout(180_000);
  await reachTools(admin);
  await chooseCustomTools(admin);
  for (let index = 0; index < 128; index++) {
    await addSelector(admin, `tool:x_selector_boundary_${index}`);
  }
  await expect(
    admin.getByText('Checking the selected tools…', { exact: true }),
  ).toBeHidden();
  await admin
    .getByRole('button', { name: 'Continue', exact: true })
    .first()
    .click();
  await expectWizardStep(admin, 'Review');
  await admin
    .getByRole('button', { name: 'Back', exact: true })
    .first()
    .click();
  await expectWizardStep(admin, 'Tools');
  await openSelectorInput(admin);
  await addSelector(admin, 'tool:x_selector_boundary_128');
  await expect(
    admin.getByText(
      /This toolset lists 129 selectors but an agent may list at most 128/,
    ),
  ).toBeVisible();
  await admin
    .getByRole('button', { name: 'Continue', exact: true })
    .first()
    .click();
  await expectWizardStep(admin, 'Tools');
  await expectNoHorizontalScroll(admin, '129-selector refusal');
});

test('toolset boundaries accept 8192 UTF-8 bytes over POST and refuse 8193', async ({
  admin,
}) => {
  test.setTimeout(180_000);
  await reachTools(admin);
  await chooseCustomTools(admin);
  const accepted = `tool:${'é'.repeat(4093)}a`;
  expect(Buffer.byteLength(accepted, 'utf8')).toBe(8192);
  const requestPromise = admin.waitForRequest(
    request =>
      new URL(request.url()).pathname.endsWith('/tools/filter') &&
      request.method() === 'POST',
  );
  await addSelector(admin, accepted);
  const request = await requestPromise;
  expect(new URL(request.url()).searchParams.has('toolset')).toBe(false);
  await expect(
    admin.getByText('Checking the selected tools…', { exact: true }),
  ).toBeHidden();
  await admin
    .getByRole('button', { name: 'Continue', exact: true })
    .first()
    .click();
  await expectWizardStep(admin, 'Review');
  await admin
    .getByRole('button', { name: 'Back', exact: true })
    .first()
    .click();
  await expectWizardStep(admin, 'Tools');
  await chooseCustomTools(admin);
  const refused = `${accepted}b`;
  expect(Buffer.byteLength(refused, 'utf8')).toBe(8193);
  await addSelector(admin, refused);
  await expect(
    admin
      .getByText(
        'toolset encodes to 8193 bytes, more than the 8192 allowed inline; define a preset',
        { exact: true },
      )
      .first(),
  ).toBeVisible();
  await admin
    .getByRole('button', { name: 'Continue', exact: true })
    .first()
    .click();
  await expectWizardStep(admin, 'Tools');
  await expectNoHorizontalScroll(admin, '8193-byte refusal');
});

test('a failed toolset resolution blocks Continue and Check again recovers the selection', async ({
  admin,
}) => {
  await reachTools(admin);
  await chooseCustomTools(admin);
  const selector = 'tool:x_selector_retry_probe';
  let failed = false;
  await admin.route('**/tools/filter**', async route => {
    if (!failed && route.request().method() === 'POST') {
      failed = true;
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            name: 'ServiceUnavailableError',
            message: 'Temporary toolset resolution failure',
          },
        }),
      });
      return;
    }
    await route.continue();
  });
  try {
    await addSelector(admin, selector);
    await expect(
      admin.getByRole('button', { name: 'Check again', exact: true }),
    ).toBeVisible();
    expect(failed).toBe(true);
    await admin
      .getByRole('button', { name: 'Continue', exact: true })
      .first()
      .click();
    await expectWizardStep(admin, 'Tools');
    await admin
      .getByRole('button', { name: 'Check again', exact: true })
      .click();
    await expect(
      admin.getByRole('button', { name: 'Check again', exact: true }),
    ).toBeHidden();
    await expect(
      admin.getByText('x_selector_retry_probe', { exact: false }).first(),
    ).toBeVisible();
    await admin
      .getByRole('button', { name: 'Continue', exact: true })
      .first()
      .click();
    await expectWizardStep(admin, 'Review');
    await expect(
      admin.getByText('1 individual tool', { exact: true }),
    ).toBeVisible();
  } finally {
    await admin.unroute('**/tools/filter**');
  }
});

test('connector cards name their state and All selection at desktop and phone widths', async ({
  admin,
}) => {
  await reachTools(admin);
  await admin
    .getByRole('radio', { name: 'Only the tools I choose below', exact: true })
    .check();
  const card = admin.getByRole('group', { name: /^Connector / }).first();
  await expect(card).toBeVisible();
  await expect(card).toContainText(/Connected|Sign-in needed|Not connected/);
  await card.getByRole('radio', { name: 'All', exact: true }).check();

  for (const width of [1440, 375]) {
    await admin.setViewportSize({ width, height: 900 });
    await expect(
      card.getByRole('radio', { name: 'All', exact: true }),
    ).toBeChecked();
    await expect(card).toContainText(
      'Selected: all tools, including ones added later.',
    );
    await expect(async () => {
      await expectNoHorizontalScroll(admin, `Connector choices at ${width}px`);
    }).toPass({ timeout: 5_000 });
  }
});

test('toolsets accept 36 selectors and explain the byte limit beside Continue', async ({
  admin,
}) => {
  test.setTimeout(180_000);
  await reachTools(admin);
  await admin
    .getByRole('radio', { name: 'Nothing outside the chat', exact: true })
    .check();
  await admin
    .getByRole('radio', { name: 'Only the tools I choose below', exact: true })
    .check();
  await admin
    .getByRole('button', {
      name: 'Choose individual tools instead',
      exact: true,
    })
    .click();
  await admin.getByText('Add a selector by name', { exact: true }).click();
  const selector = admin.getByRole('textbox', {
    name: 'Selector',
    exact: true,
  });
  for (let index = 0; index < 36; index++) {
    await selector.fill(`tool:x_selector_limit_check_${index}`);
    await admin
      .getByRole('button', { name: 'Add selector', exact: true })
      .click();
  }
  await expect(
    admin.getByText('Too many selectors', { exact: true }),
  ).toBeHidden();
  await expect(
    admin.getByText('Checking the selected tools…', { exact: true }),
  ).toBeHidden();
  await admin
    .getByRole('button', { name: 'Continue', exact: true })
    .first()
    .click();
  await expectWizardStep(admin, 'Review');
  await admin
    .getByRole('button', { name: 'Back', exact: true })
    .first()
    .click();
  await expectWizardStep(admin, 'Tools');
  await admin
    .getByRole('radio', { name: 'Nothing outside the chat', exact: true })
    .check();
  await admin
    .getByRole('radio', { name: 'Only the tools I choose below', exact: true })
    .check();
  const individual = admin.getByRole('button', {
    name: 'Choose individual tools instead',
    exact: true,
  });
  if (await individual.isVisible()) await individual.click();
  await admin.getByText('Add a selector by name', { exact: true }).click();
  await selector.fill(`tool:${'é'.repeat(4094)}`);
  await admin
    .getByRole('button', { name: 'Add selector', exact: true })
    .click();
  const reason =
    'toolset encodes to 8193 bytes, more than the 8192 allowed inline; define a preset';
  for (const width of [1440, 375]) {
    await admin.setViewportSize({ width, height: 900 });
    await expect(
      admin.getByText(reason, { exact: true }).first(),
    ).toBeVisible();
    await admin
      .getByRole('button', { name: 'Continue', exact: true })
      .first()
      .click();
    await expectWizardStep(admin, 'Tools');
    await expectNoHorizontalScroll(admin, `Toolset byte limit at ${width}px`);
  }
});

test('the Selected rail docks only where the step keeps its column, the bar stands in otherwise', async ({
  admin,
}) => {
  await admin.setViewportSize({ width: 1280, height: 900 });
  try {
    await reachTools(admin);
    const rail = admin.getByRole('complementary', { name: 'Selected' });
    const bar = admin.getByRole('region', { name: 'Selected so far' });
    const step = admin.getByRole('radiogroup', { name: 'What it may do' });

    for (const width of [1280, 1180, 1024, 900, 768]) {
      await admin.setViewportSize({ width, height: 900 });
      await expect(async () => {
        expect(
          `${await rail.isVisible()}/${await bar.isVisible()}`,
          `${width}px: exactly one of the rail and the bar`,
        ).toMatch(/^(true\/false|false\/true)$/);
        await expectNoHorizontalScroll(admin, `Tools at ${width}px`);
        if (await rail.isVisible()) {
          const railBox = (await rail.boundingBox())!;
          const stepBox = (await step.boundingBox())!;
          expect(
            railBox.x,
            `${width}px: the rail sits right of the step`,
          ).toBeGreaterThanOrEqual(stepBox.x + stepBox.width);
          expect(
            stepBox.width,
            `${width}px: the step keeps its 400px column beside the rail`,
          ).toBeGreaterThanOrEqual(400 - 48);
          expect(railBox.x + railBox.width).toBeLessThanOrEqual(width);
        }
        if (width === 1280) {
          await expect(rail, '1280px docks the rail').toBeVisible();
        }
        if (width === 768) {
          await expect(bar, '768px has no room for the rail').toBeVisible();
        }
      }).toPass({ timeout: 5_000 });
    }
  } finally {
    await admin.setViewportSize({ width: 1440, height: 900 });
  }
});
