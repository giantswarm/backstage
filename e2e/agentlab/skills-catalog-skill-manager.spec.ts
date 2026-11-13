import type { Page, Response } from '@playwright/test';
import { expect, expectWizardStep, gotoApp, open, test } from './fixtures';

/**
 * The portal reads skills and plugins from the installation's skill-manager,
 * through muster as the signed-in person, and nowhere else: on the wizard's
 * skills step every plugin of `x_skill-manager_list_skills`' answer is
 * offered, each as a row with a plugin checkbox, an Agent Plugins package
 * folding out its skills, and gs-backend's own `/agent-skills` discovery is
 * never asked. A skill's page reads its SKILL.md with `x_skill-manager_get_skill`.
 *
 * Needs a lab whose muster lists skill-manager with at least one plugin
 * among its sources (a `platform.valuesFiles` overlay setting
 * `skillManager.sources`). Skips on a lab without skill-manager.
 */

type Plugin = {
  name: string;
  format: 'agent-plugins' | 'claude-code';
  skills: { name: string }[];
};
type Repository = {
  repoUrl: string;
  skills: { name: string; path: string }[];
  plugins?: Plugin[];
};

/**
 * A plugin row's fold-out: its trigger is named by the plugin's name and the
 * line after it, so the name is matched whole, then a space ("app" must not
 * open "app-dev").
 */
function pluginTrigger(page: Page, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return page.getByRole('button', { name: new RegExp(`^${escaped} `) });
}

function toolOf(response: Response): string | undefined {
  if (!response.url().includes('/api/muster/call')) {
    return undefined;
  }
  try {
    return JSON.parse(response.request().postData() ?? '{}').name;
  } catch {
    return undefined;
  }
}

/** The repositories wherever the muster proxy nests them in its answer. */
function repositoriesIn(value: unknown): Repository[] | undefined {
  if (typeof value === 'string') {
    try {
      return repositoriesIn(JSON.parse(value));
    } catch {
      return undefined;
    }
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.repositories)) {
      return record.repositories as Repository[];
    }
    for (const child of Object.values(record)) {
      const found = repositoriesIn(child);
      if (found) {
        return found;
      }
    }
  }
  return undefined;
}

/** A get_skill answer's file list, wherever the muster proxy nests it. */
function filesIn(value: unknown): { path: string }[] | undefined {
  if (typeof value === 'string') {
    try {
      return filesIn(JSON.parse(value));
    } catch {
      return undefined;
    }
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.files)) {
      return record.files as { path: string }[];
    }
    for (const child of Object.values(record)) {
      const found = filesIn(child);
      if (found) {
        return found;
      }
    }
  }
  return undefined;
}

/**
 * Records whether the page ever said muster could not be asked about
 * skill-manager, however briefly: a source that settles must never pass
 * through that state.
 */
async function watchUnreachable(page: Page) {
  await page.addInitScript(() => {
    const seen = () =>
      document.body?.innerText.includes('Could not ask muster on') ?? false;
    new MutationObserver(() => {
      if (seen()) {
        (
          window as unknown as { __skillsUnreachable: boolean }
        ).__skillsUnreachable = true;
      }
    }).observe(document, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  });
  return async () =>
    page.evaluate(
      () =>
        (window as unknown as { __skillsUnreachable?: boolean })
          .__skillsUnreachable === true,
    );
}

function watchSkillReads(page: Page) {
  const portalDiscovery: string[] = [];
  const tools: Response[] = [];
  page.on('request', request => {
    if (/\/api\/gs\/agent-skills(\?|\/content|$)/.test(request.url())) {
      portalDiscovery.push(request.url());
    }
  });
  page.on('response', response => {
    if (toolOf(response)?.startsWith('x_skill-manager_')) {
      tools.push(response);
    }
  });
  return { portalDiscovery, tools };
}

test('the wizard offers what skill-manager lists, plugins included', async ({
  admin,
}) => {
  test.setTimeout(5 * 60_000);
  const reads = watchSkillReads(admin);
  const sawUnreachable = await watchUnreachable(admin);
  const listed = admin
    .waitForResponse(
      response => toolOf(response) === 'x_skill-manager_list_skills',
      {
        timeout: 90_000,
      },
    )
    .catch(() => undefined);

  // The Details step alone: the Skills step needs only a name. The shared
  // wizard helper also waits for an Owner field that a lab's agent-manager
  // may not offer, which this proof does not depend on.
  await open(admin, '/customize/agents/new');
  await expectWizardStep(admin, 'Details');
  await admin
    .getByRole('textbox', { name: 'Name', exact: true })
    .fill('E2E Skills Catalog');
  await admin.getByRole('button', { name: 'Continue' }).click();
  await expectWizardStep(admin, 'Skills');
  const response = await listed;
  test.skip(!response, 'muster lists no skill-manager on this lab');
  expect(response!.ok()).toBe(true);
  const repositories = repositoriesIn(await response!.json());
  expect(repositories, 'list_skills answered repositories').toBeDefined();
  const plugins = repositories!.flatMap(repo => repo.plugins ?? []);
  expect(plugins.length, 'the sources hold a plugin').toBeGreaterThan(0);

  for (const plugin of plugins) {
    if (plugin.format === 'claude-code') {
      await expect(
        admin.getByRole('checkbox', {
          name: `Plugin ${plugin.name}`,
          exact: true,
        }),
        `Claude Code plugin ${plugin.name}`,
      ).toBeVisible();
    } else if (plugin.skills.length > 0) {
      await expect(
        admin.getByRole('checkbox', {
          name: `Plugin ${plugin.name}`,
          exact: true,
        }),
        `Agent Plugins package ${plugin.name}`,
      ).toBeVisible();
      // A package's skills are folded under its row until it is opened.
      await pluginTrigger(admin, plugin.name).click();
      const group = admin.getByRole('group', {
        name: `Skills of plugin ${plugin.name}`,
        exact: true,
      });
      await expect(group, `Agent Plugins package ${plugin.name}`).toBeVisible();
      for (const skill of plugin.skills) {
        await expect(
          group.getByText(skill.name, { exact: true }),
        ).toBeVisible();
      }
    }
  }
  await test.info().attach('list_skills', {
    body: JSON.stringify(repositories, null, 2),
    contentType: 'application/json',
  });
  await test.info().attach('the skills step', {
    body: await admin.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
  expect(reads.portalDiscovery, 'gs-backend discovery is not asked').toEqual(
    [],
  );
  expect(await sawUnreachable(), 'muster was never reported unreachable').toBe(
    false,
  );
});

test('a skill page reads its SKILL.md through skill-manager', async ({
  admin,
}) => {
  const reads = watchSkillReads(admin);
  const sawUnreachable = await watchUnreachable(admin);
  const listed = admin
    .waitForResponse(
      response => toolOf(response) === 'x_skill-manager_list_skills',
      {
        timeout: 90_000,
      },
    )
    .catch(() => undefined);
  await gotoApp(admin, '/customize/skills');
  const response = await listed;
  test.skip(!response, 'muster lists no skill-manager on this lab');
  const skill = repositoriesIn(await response!.json())!.flatMap(
    repo => repo.skills,
  )[0];
  test.skip(!skill, 'the sources hold no skill');

  await admin.getByText(skill.name, { exact: true }).first().click();
  // The overview comes from the listing; the Instructions tab reads the
  // SKILL.md.
  const read = admin.waitForResponse(
    r => toolOf(r) === 'x_skill-manager_get_skill',
    { timeout: 60_000 },
  );
  await admin.getByRole('tab', { name: 'Instructions' }).click();
  const content = await read;
  expect(content.ok()).toBe(true);
  await expect(
    admin.getByText(new RegExp(`${skill.path}/SKILL\\.md at [0-9a-f]{7}`)),
    'the SKILL.md is shown at its commit',
  ).toBeVisible();
  // A reference file is read with get_skill_file.
  const file = filesIn(await content.json())?.find(
    f => f.path !== 'SKILL.md' && f.path.endsWith('.md'),
  );
  test.skip(!file, 'the skill has no other Markdown file');
  const reference = admin
    .getByText(file!.path.split('/').pop()!, { exact: true })
    .first();
  const fileRead = admin.waitForResponse(
    r => toolOf(r) === 'x_skill-manager_get_skill_file',
    { timeout: 60_000 },
  );
  await reference.click();
  expect((await fileRead).ok()).toBe(true);
  await test.info().attach('the skill page', {
    body: await admin.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
  expect(
    reads.portalDiscovery,
    'gs-backend content routes are not asked',
  ).toEqual([]);
  expect(await sawUnreachable(), 'muster was never reported unreachable').toBe(
    false,
  );
});
