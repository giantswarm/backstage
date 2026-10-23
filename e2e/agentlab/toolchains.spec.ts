import type { Response } from '@playwright/test';

import {
  createAgentInWizard,
  deleteAgentInPortal,
  expect,
  open,
  startSessionButton,
  test,
} from './fixtures';
import { KUBECONFIG, kubectl, NEEDS_KUBECONFIG } from './kubectl';
import { lab } from './lab';

/**
 * Toolchains in the Dev Portal: Customize → Toolchains lists what the lab's
 * toolchain-manager offers (`list_toolchains`, each newest version's tools
 * from `describe_toolchain`), a toolchain's page switches between its
 * versions, and a session started from the portal with another version of
 * `go` than the agent's default mounts that version: the composer's
 * Toolchains choice reaches agent-manager's `start_session` as
 * `toolchains: ['go@<older>']`, and its answer names `go` at that version,
 * pinned by digest.
 *
 * Needs a lab with the toolchain-manager in muster, read as the admin with
 * their grant of its GitHub App, and `go` published at two versions at
 * least; for the session, agent-manager's `toolchains` capability (its
 * `toolchains.repository`), a kagent that mounts session tool images and the
 * `codex` Harness with the in-cluster mock model, as `agentlab coding-test
 * --part toolchains` needs. Skips naming the missing piece.
 */

test.describe.configure({ mode: 'serial' });

const MODEL = process.env.AGENTLAB_CODEX_MODEL ?? 'codex-mock';
const PROMPT =
  process.env.AGENTLAB_CODEX_PROMPT ?? 'Run the requested shell command.';
const NAMESPACE = 'kagent';

const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(4, 12);
const agentName = `E2E Toolchains ${stamp}`;
const agentSlug = `e2e-toolchains-${stamp}`;

type StartedToolchain = { name: string; version?: string; image: string };

/** `go`'s published versions as the Toolchains tab lists them, or why not. */
async function goVersions(
  page: Parameters<typeof open>[0],
): Promise<string[] | { missing: string }> {
  await open(page, '/customize/toolchains');
  const unavailable = page.getByText('Toolchains are not available here');
  const grant = page.getByText(
    'Allow the toolchain-manager to read the toolchain sources as you',
  );
  const go = page.getByRole('row', { name: /^go\b/ });
  await expect(unavailable.or(grant).or(go).first()).toBeVisible({
    timeout: 2 * 60_000,
  });
  if (await unavailable.isVisible()) {
    return { missing: "the lab's muster lists no toolchain-manager" };
  }
  if (await grant.isVisible()) {
    return {
      missing:
        "the admin has not granted the toolchain-manager's GitHub App in muster",
    };
  }
  const versions = (await go.getByRole('gridcell').nth(1).innerText())
    .split('\n')[0]
    .split(',')
    .map(version => version.trim());
  return versions.length > 1
    ? versions
    : { missing: '`go` is published at one version only' };
}

test('the Toolchains tab lists the toolchains with their versions and tools, and a toolchain’s page switches versions', async ({
  admin,
}) => {
  const versions = await goVersions(admin);
  test.skip(
    !Array.isArray(versions),
    'missing' in versions ? versions.missing : '',
  );
  const [newest, older] = versions as string[];

  const go = admin.getByRole('row', { name: /^go\b/ });
  await expect(go).toContainText(`${newest}, ${older}`);
  // The newest version's tools, read from its image's labels.
  await expect(go.getByRole('gridcell').nth(2)).toContainText(/\bgo\b/, {
    timeout: 60_000,
  });
  await expect(
    admin.getByRole('heading', { name: 'Sources' }),
    'the sources the toolchains come from',
  ).toBeVisible();
  await test.info().attach('the Toolchains tab', {
    body: await admin.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });

  await go.getByRole('link', { name: 'go' }).click();
  await expect(admin).toHaveURL(
    new RegExp(`/customize/toolchains/${lab.installation}/go$`),
  );
  await expect(admin.getByRole('heading', { name: 'Tools' })).toBeVisible({
    timeout: 60_000,
  });
  const image = admin.getByText(/agent-toolchains\/go:/).first();
  await expect(image).toContainText(`go:${newest}`);

  await admin.getByRole('button', { name: /Version/ }).click();
  await admin.getByRole('option', { name: older, exact: true }).click();
  await expect(admin).toHaveURL(new RegExp(`\\?version=${older}$`));
  await expect(image).toContainText(`go:${older}`, { timeout: 60_000 });
  await test.info().attach('go at its older version', {
    body: await admin.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
});

test('a session started from the portal with an older go mounts that version', async ({
  admin,
}) => {
  test.skip(!KUBECONFIG, NEEDS_KUBECONFIG);
  const versions = await goVersions(admin);
  test.skip(
    !Array.isArray(versions),
    'missing' in versions ? versions.missing : '',
  );
  const older = (versions as string[])[1];
  const { stdout } = await kubectl([
    '-n',
    NAMESPACE,
    'get',
    'harnesses.api.kagent.dev,modelconfigs.api.kagent.dev',
    '-o',
    'jsonpath={range .items[*]}{.kind}/{.metadata.name}\t{.metadata.annotations.ui\\.giantswarm\\.io/display-name}{"\\n"}{end}',
  ]);
  const objects = new Map(
    stdout
      .split('\n')
      .filter(Boolean)
      .map(line => line.split('\t') as [string, string]),
  );
  test.skip(
    !objects.has('Harness/codex'),
    `the lab offers no codex Harness in ${NAMESPACE}`,
  );
  test.skip(
    !objects.has(`ModelConfig/${MODEL}`),
    `the lab has no ModelConfig ${MODEL} in ${NAMESPACE} (AGENTLAB_CODEX_MODEL)`,
  );
  const modelLabel = objects.get(`ModelConfig/${MODEL}`) || MODEL;
  test.setTimeout(15 * 60_000);

  const detailPath = await createAgentInWizard(admin, agentName, agentSlug, {
    harness: /^Codex, Harness codex\b/,
    model: `Select model ${modelLabel}`,
  });

  let failure: unknown;
  try {
    await expect(
      admin.getByTestId('agent-readiness').getByText('Ready', { exact: true }),
      'the codex agent becomes ready',
    ).toBeVisible({ timeout: 6 * 60_000 });
    await startSessionButton(admin).click();
    const dialog = admin.getByRole('dialog', { name: 'New session' });
    await dialog.getByRole('textbox', { name: 'Prompt' }).fill(PROMPT);

    const toolchains = dialog.getByRole('button', { name: /^Toolchains: / });
    const offered = await toolchains
      .waitFor({ timeout: 60_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(
      !offered,
      "agent-manager reports no `toolchains` capability: its toolchains.repository is not set in the lab's values",
    );
    await toolchains.click();
    const choice = admin.getByRole('dialog', { name: 'Toolchains' });
    const goBox = choice.getByRole('checkbox', { name: 'go' });
    if (!(await goBox.isChecked())) {
      await goBox.click();
    }
    await choice.getByRole('button', { name: /go version/ }).click();
    await admin.getByRole('option', { name: older, exact: true }).click();
    await admin.keyboard.press('Escape');
    await expect(toolchains).toContainText(`go ${older}`);
    await test
      .info()
      .attach('the New session dialog with go at its older version', {
        body: await admin.screenshot(),
        contentType: 'image/png',
      });

    const started = admin.waitForResponse(
      (response: Response) =>
        response.url().includes('/api/muster/call') &&
        response.request().postDataJSON()?.name ===
          'x_agent-manager_start_session',
      { timeout: 2 * 60_000 },
    );
    await dialog.getByRole('button', { name: 'Start', exact: true }).click();
    const response = await started;
    const request = response.request().postDataJSON() as {
      arguments?: { toolchains?: string[] };
    };
    expect(request.arguments?.toolchains).toEqual(
      expect.arrayContaining([`go@${older}`]),
    );
    const answer = (await response.json()) as {
      toolchains?: StartedToolchain[];
    };
    const mounted = answer.toolchains ?? [];
    const go = mounted.find(toolchain => toolchain.name === 'go');
    expect(go, 'start_session mounts go').toBeDefined();
    expect(go?.version).toBe(older);
    expect(go?.image, 'pinned by digest').toMatch(/@sha256:[0-9a-f]{64}$/);
    await test.info().attach('start_session answer', {
      body: JSON.stringify(mounted, null, 2),
      contentType: 'application/json',
    });
    await expect(admin).toHaveURL(
      new RegExp(`/sessions/${lab.installation}/[^/]+$`),
      { timeout: 60_000 },
    );
  } catch (error) {
    failure = error;
  }

  try {
    await deleteAgentInPortal(admin, detailPath, agentSlug);
  } catch (cleanupError) {
    if (failure === undefined) {
      throw cleanupError;
    }
  }
  if (failure !== undefined) {
    throw failure;
  }
});
