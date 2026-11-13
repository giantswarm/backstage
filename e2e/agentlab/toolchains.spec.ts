import type { Locator, Response } from '@playwright/test';

import {
  completeDexLogin,
  createAgentInWizard,
  deleteAgentInPortal,
  expect,
  open,
  startSessionButton,
  test,
  openThroughConsent,
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

/** Whether any text in the element is cut off, by an ellipsis or a clip. */
function isCutOff(locator: Locator): Promise<boolean> {
  return locator.evaluate(element =>
    [element, ...Array.from(element.querySelectorAll('*'))].some(
      node => node.scrollWidth > node.clientWidth + 1,
    ),
  );
}

/** `go`'s published versions as the Toolchains tab lists them, or why not. */
async function goVersions(
  page: Parameters<typeof open>[0],
): Promise<string[] | { missing: string }> {
  await open(page, '/customize/toolchains');
  const unavailable = page.getByText('Toolchains are not available here');
  const grant = page.getByText(
    'Allow the toolchain-manager to read the toolchain sources as you',
  );
  const go = page.getByRole('row').filter({
    has: page.getByRole('link', { name: 'go', exact: true }),
  });
  const signIn = page.getByTestId('toolchains-sign-in').first();
  await expect(unavailable.or(grant).or(signIn).or(go).first()).toBeVisible({
    timeout: 2 * 60_000,
  });
  if (await signIn.isVisible()) {
    // muster's per-server sign-in to the toolchain-manager: a popup through
    // muster's OAuth proxy. On a lab whose toolchain-manager accepts the lab
    // Dex it is completed as the same fixture account; one through its
    // GitHub App is the person's own GitHub sign-in, which no headless run
    // completes.
    const popup = await openThroughConsent(
      page,
      signIn.getByRole('button', { name: /Sign in/ }),
    );
    // Muster may first renew its Dex login, then send the same popup on
    // to GitHub. completeDexLogin closes that popup after leaving Dex, so
    // remember the next hop before it does: the person's App grant needs
    // the real browser even when the popup did not start on GitHub.
    let needsGitHubSignIn = false;
    popup.on('request', request => {
      if (new URL(request.url()).hostname === 'github.com') {
        needsGitHubSignIn = true;
      }
    });
    const missingSignIn = {
      missing:
        'the admin has not signed in to the toolchain-manager through its GitHub App (a real GitHub sign-in, once per lab muster)',
    };
    await popup.waitForURL(url => url.href !== 'about:blank');
    if (new URL(popup.url()).hostname === 'github.com') {
      await popup.close();
      return missingSignIn;
    }
    await completeDexLogin(popup, lab.users.admin);
    if (needsGitHubSignIn) {
      return missingSignIn;
    }
    await expect(unavailable.or(grant).or(go).first()).toBeVisible({
      timeout: 2 * 60_000,
    });
  }
  if (await unavailable.isVisible()) {
    return { missing: "the lab's muster lists no toolchain-manager" };
  }
  if (await grant.isVisible()) {
    return {
      missing:
        "the admin has not granted the toolchain-manager's GitHub App in muster",
    };
  }
  // The Toolchain column is the row's header: the first gridcell is Versions.
  const versions = (await go.getByRole('gridcell').first().innerText())
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

  const go = admin.getByRole('row').filter({
    has: admin.getByRole('link', { name: 'go', exact: true }),
  });
  await expect(go).toContainText(`${newest}, ${older}`);
  // The newest version's tools, read from its image's labels.
  await expect(go.getByRole('gridcell').nth(1)).toContainText(/\bgo\b/, {
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
    const choice = admin.getByRole('dialog', { name: 'Toolchains' });
    // Escape closes an open version select first, then the popover. One
    // more than that would close the New session dialog behind it.
    const closeChoice = async () => {
      if (await admin.getByRole('listbox').isVisible()) {
        await admin.keyboard.press('Escape');
        await expect(admin.getByRole('listbox')).toBeHidden();
      }
      await admin.keyboard.press('Escape');
      await expect(choice).toBeHidden();
    };

    // Every toolchain picked: the button counts them, and the agent and
    // workspace beside it stay readable
    // (giantswarm/giantswarm#39204).
    await toolchains.click();
    const boxes = choice.getByRole('checkbox');
    const offeredCount = await boxes.count();
    for (let i = 0; i < offeredCount; i++) {
      const box = boxes.nth(i);
      if (!(await box.isChecked())) {
        await box.locator('xpath=ancestor::label').click();
      }
    }
    await closeChoice();
    await expect(toolchains).toHaveText(String(offeredCount));
    // The agent's page offers no other agent: it is named, not a picker.
    const agentLabel = dialog.getByRole('group', { name: 'Agent' });
    await expect(agentLabel).toContainText(agentName);
    expect(await isCutOff(agentLabel), 'the agent name is cut off').toBe(false);
    // react-aria names the select by its value and its label: "<workspace>
    // Workspace". A long name may end in an ellipsis, but the picker keeps
    // room for more than its icon. A lab without the workspace-manager has
    // no workspace picker; the run says so.
    const workspacePicker = dialog.getByRole('button', {
      name: /\bWorkspace$/,
    });
    if ((await workspacePicker.count()) > 0) {
      expect((await workspacePicker.boundingBox())?.width).toBeGreaterThan(80);
    } else {
      test.info().annotations.push({
        type: 'skipped check',
        description:
          "the workspace picker's width: no workspace-manager in the lab",
      });
    }
    await test
      .info()
      .attach(`the New session dialog with all ${offeredCount} toolchains`, {
        body: await admin.screenshot(),
        contentType: 'image/png',
      });
    // Back to the agent's defaults; there is nothing to reset when every
    // offered toolchain is one.
    await toolchains.click();
    const reset = choice.getByRole('button', {
      name: /^Use .*defaults$|^Mount no toolchains$/,
    });
    if ((await reset.count()) > 0) {
      await reset.click();
    }
    await closeChoice();

    await toolchains.click();
    const goBox = choice.getByRole('checkbox', { name: 'go' });
    if (!(await goBox.isChecked())) {
      // The label around the (visually hidden) input takes the click.
      await goBox.locator('xpath=ancestor::label').click();
    }
    await choice.getByRole('button', { name: /go version/ }).click();
    await admin.getByRole('option', { name: older, exact: true }).click();
    await closeChoice();
    // The button shows how many; its tooltip says which.
    await toolchains.hover();
    await expect(admin.getByRole('tooltip')).toContainText(
      new RegExp(`\\bgo ${older.replace(/\./g, '\\.')}\\b`),
    );
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
      // agent-manager allows three minutes for a cold toolset's snapshot;
      // leave room for its result instead of aborting that first start.
      { timeout: 4 * 60_000 },
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
      error?: { message?: string };
    };
    test.skip(
      /mounts no session tool images/.test(answer.error?.message ?? ''),
      `the lab's kagent controller mounts no session tool images (KAGENT_SESSION_TOOL_IMAGE_REPOSITORIES): ${answer.error?.message}`,
    );
    const mounted = answer.toolchains ?? [];
    const go = mounted.find(toolchain => toolchain.name === 'go');
    expect(go, 'start_session mounts go').toBeDefined();
    expect(go?.version?.replace(/^v/, '')).toBe(older);
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
