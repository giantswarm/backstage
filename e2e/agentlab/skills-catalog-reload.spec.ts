import {
  expect,
  expectWizardStep,
  open,
  reloadAccepting,
  test,
} from './fixtures';

/** Stage only the catalog; the wizard, persistence, reload and Dex are real. */
test('the Skills step restores cached private repositories after a reload', async ({
  admin,
}) => {
  test.setTimeout(120_000);
  const repoUrl = 'https://github.com/giantswarm/e2e-private-skills';
  const skill = {
    name: 'Persisted private skill',
    description: 'A private catalog reload fixture',
    path: 'private-skill',
    repoUrl,
    ref: 'main',
    commit: 'b'.repeat(40),
  };
  let restored = false;
  const answer = {
    skills: [skill],
    plugins: [],
    private: true,
  };
  // Cover whichever catalog the lab's installation offers. After reload no
  // network answer can replace the persisted entry and hide a broken restore.
  await admin.route('**/api/gs/agent-skills?**', async route => {
    await route.fulfill(
      restored ? { status: 503, json: {} } : { json: answer },
    );
  });
  await admin.route('**/api/muster/call**', async route => {
    if (
      route.request().postDataJSON()?.name !== 'x_skill-manager_list_skills'
    ) {
      await route.fallback();
      return;
    }
    await route.fulfill(
      restored
        ? { status: 503, json: {} }
        : {
            json: {
              repositories: [
                {
                  repoUrl,
                  private: true,
                  truncated: false,
                  skills: [skill],
                  plugins: [],
                },
              ],
            },
          },
    );
  });
  await open(admin, '/customize/agents/new');
  await expectWizardStep(admin, 'Details');
  await admin
    .getByRole('textbox', { name: 'Name', exact: true })
    .fill('Catalog reload');
  await admin.getByRole('button', { name: 'Continue' }).click();
  await expectWizardStep(admin, 'Skills');
  const card = admin.getByRole('checkbox', { name: `Skill ${skill.name}` });
  await expect(card).toBeVisible();
  await expect(card).toContainText('private');

  // Writes are throttled: wait for this catalog's entry to reach localStorage.
  await expect
    .poll(
      () =>
        admin.evaluate(url => {
          const raw = localStorage.getItem('agent-platform-react-query-cache');
          if (!raw) return false;
          const queries = JSON.parse(raw).clientState.queries as {
            queryKey: string[];
            state: { data: unknown };
          }[];
          return queries.some(
            query =>
              query.queryKey.includes('json-v1') &&
              JSON.stringify(query.state.data).includes(url),
          );
        }, repoUrl),
      { timeout: 45_000 },
    )
    .toBe(true);

  restored = true;
  await reloadAccepting(admin);
  await expectWizardStep(admin, 'Skills');
  await expect(card).toBeVisible();
  await expect(card).toContainText('private');
  await test.info().attach('private skills after reload', {
    body: await admin.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
});
