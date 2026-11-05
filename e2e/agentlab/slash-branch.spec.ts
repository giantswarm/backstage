import { execFileSync } from 'node:child_process';

import type { Page } from '@playwright/test';

import { expect, open, test } from './fixtures';

/**
 * A template registered from a branch whose name contains a slash
 * (giantswarm/backstage#2774): `blob/feat/x/…` is ambiguous, and the backend's
 * GitHub URL reader used to take `feat` for the branch and fail with not found.
 *
 * The template is the suite's fixture `templates/slash-branch/template.yaml`,
 * read from the checkout's own branch on GitHub — every pull request branch
 * here is named `feat/…` or `fix/…`, and must be pushed. It fetches its
 * `./skeleton` (a tree read on the same branch) and logs; nothing outside the
 * task is touched. `AGENTLAB_SLASH_BRANCH` names another pushed branch.
 *
 * The backend reads GitHub with the lab's GitHub integration, anonymously
 * when the lab configures none. A read GitHub refuses (403, or 429 for its
 * secondary limit) is a quota the lab ran out of, not a portal fault, so the
 * test skips with GitHub's answer.
 */
const branch =
  process.env.AGENTLAB_SLASH_BRANCH ??
  execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
const TEMPLATE = 'e2e-slash-branch';
const TEMPLATE_URL = `https://github.com/giantswarm/backstage/blob/${branch}/e2e/agentlab/templates/slash-branch/template.yaml`;

/** GitHub's refusal in a backend read error, as the GitHub URL reader words it. */
const GITHUB_REFUSED =
  /(?:Request failed for https:\/\/[^\s,]*github[^\s,]*|Reading the refs of a GitHub repository failed), (?:403|429)\b[^,\n"]*/;

/** Skips the test when `message` holds GitHub's refusal of a backend read. */
function skipIfGitHubRefused(message: string) {
  const refused = message.match(GITHUB_REFUSED)?.[0];
  test.skip(
    refused !== undefined,
    `GitHub refused the lab's read (${refused}): give the lab's Backstage a GitHub integration (integrations.github) with credentials, or wait for its quota to reset`,
  );
}

/** The Backstage token the page sends with its own catalog reads. */
async function backstageToken(page: Page): Promise<string> {
  const read = page.waitForRequest(
    request =>
      request.url().includes('/api/catalog/') &&
      Boolean(request.headers()['x-backstage-token']),
  );
  await page.goto('/catalog');
  return (await read).headers()['x-backstage-token'];
}

test.describe('a template on a branch with a slash', () => {
  test.skip(
    !branch.includes('/'),
    `the checkout's branch "${branch}" has no slash: set AGENTLAB_SLASH_BRANCH to a pushed branch that has one`,
  );

  test('registers and runs, its skeleton fetched from the branch', async ({
    admin,
  }) => {
    await open(admin, '/catalog');
    const headers = { 'X-Backstage-Token': await backstageToken(admin) };

    // What the catalog import page sends: the portal has no such page, so
    // the location is analyzed and registered through the same catalog API
    // as the admin. The dry run reads the template at once.
    const location = { type: 'url', target: TEMPLATE_URL };
    const analyze = () =>
      admin.request.post('/api/catalog/locations?dryRun=true', {
        headers,
        data: location,
      });
    const analyzed = await analyze();
    if (analyzed.status() !== 201) {
      skipIfGitHubRefused(await analyzed.text());
    }
    expect(analyzed.status(), await analyzed.text()).toBe(201);
    expect(
      (await analyzed.json()).entities
        .filter((e: { kind: string }) => e.kind === 'Template')
        .map((e: { metadata: { name: string } }) => e.metadata.name),
      'the template was read from the branch',
    ).toEqual([TEMPLATE]);

    const registered = await admin.request.post('/api/catalog/locations', {
      headers,
      data: location,
    });
    if (registered.status() !== 201) {
      skipIfGitHubRefused(await registered.text());
    }
    expect(registered.status(), await registered.text()).toBe(201);
    const { id } = (await registered.json()).location;
    try {
      const message = `slash branch ${Date.now()}`;
      try {
        await expect(async () => {
          await open(admin, `/create/templates/default/${TEMPLATE}`);
          await expect(
            admin.getByRole('textbox', { name: 'Message' }),
          ).toBeVisible();
        }).toPass({ timeout: 90_000 });
      } catch (error) {
        // The catalog reads the location again to ingest the template; the
        // dry run repeats that read and answers with its error.
        skipIfGitHubRefused(await (await analyze()).text());
        throw error;
      }
      await admin.getByRole('textbox', { name: 'Message' }).fill(message);
      await admin.getByRole('button', { name: 'Review' }).click();
      await admin.getByRole('button', { name: 'Create' }).click();

      await expect(admin).toHaveURL(/\/create\/tasks\//);
      const task = admin.url().split('/').pop();
      // The task ends completed, or failed with the read error in its log.
      await expect
        .poll(
          async () =>
            (
              await (
                await admin.request.get(`/api/scaffolder/v2/tasks/${task}`, {
                  headers,
                })
              ).json()
            ).status,
          { timeout: 120_000 },
        )
        .toMatch(/^(completed|failed)$/);
      const events = await admin.request.get(
        `/api/scaffolder/v2/tasks/${task}/events`,
        { headers },
      );
      const log = (await events.json())
        .map((e: { body: { message?: string } }) => e.body.message ?? '')
        .join('\n');
      skipIfGitHubRefused(log);
      expect(log, 'the skeleton was fetched from the branch').toContain(
        'slash-branch-skeleton.txt',
      );
      expect(log).toContain(message);
    } finally {
      await admin.request.delete(`/api/catalog/locations/${id}`, {
        headers,
      });
    }
  });
});
