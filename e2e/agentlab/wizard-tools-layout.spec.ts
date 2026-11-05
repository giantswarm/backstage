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
      await expect
        .poll(
          async () => `${await rail.isVisible()}/${await bar.isVisible()}`,
          { message: `${width}px: exactly one of the rail and the bar` },
        )
        .toMatch(/^(true\/false|false\/true)$/);
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
    }
  } finally {
    await admin.setViewportSize({ width: 1440, height: 900 });
  }
});
