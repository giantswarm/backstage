import type { Page, Route } from '@playwright/test';

import {
  expect,
  open,
  openReadyAgent,
  startSessionButton,
  test,
} from './fixtures';
import { RUN } from './lab';

/**
 * The provider connect prompt where a person first meets a provider instance
 * they have not granted: the workspace editor and the composer's start in a
 * workspace (giantswarm/backstage#2867).
 *
 * The unconnected provider is the admin's real one: the lab's
 * workspace-manager answers `list_providers` with the instances muster keeps
 * an App for and the admin never granted, each with its `signIn`. The grant
 * itself is a real provider sign-in, which no headless run makes, so its
 * outcome is staged at the browser in the manager's and muster's own shapes —
 * the instance reading connected, the App's grant reported — and the person's
 * return to the tab is a focus event.
 * The composer's workspace is staged the same way (`list_workspaces`,
 * `authorize_workspace`'s `connect_required` naming the real instance and its
 * `signIn`), and its second check refuses, so no Session is started.
 */

type ToolCall = { name?: string; arguments?: Record<string, unknown> };
type Provider = {
  name: string;
  kind: string;
  connected: boolean;
  signIn?: string;
};

const TOOL = 'x_workspace-manager_';
const WORKSPACE = `e2e-connect-${RUN}`;
const PROMPT = 'List the repositories of this workspace.';
const STOPPED = 'e2e: stopped after the sign-in, before the Session';

/**
 * Passes `list_providers` through, and once `granted` names an instance
 * answers it connected, as the manager does after the grant. Resolves with
 * the instance the admin has not granted, from the lab's own answer.
 */
async function stageProviders(page: Page, granted: Set<string>) {
  let unconnected: Provider | undefined;
  await page.route('**/api/muster/call**', async (route: Route) => {
    const call = route.request().postDataJSON() as ToolCall;
    if (call?.name !== `${TOOL}list_providers`) {
      await route.fallback();
      return;
    }
    const answer = await (await route.fetch()).json();
    const providers: Provider[] = answer?.providers ?? [];
    unconnected ??= providers.find(p => !p.connected && p.signIn);
    await route.fulfill({
      json: {
        ...answer,
        providers: providers.map(p =>
          granted.has(p.name)
            ? { ...p, connected: true, signIn: undefined }
            : p,
        ),
      },
    });
  });
  return async (): Promise<Provider> => {
    await expect
      .poll(() => unconnected, {
        timeout: 60_000,
        message:
          "the lab's list_providers names an instance the admin has not granted (with its signIn)",
      })
      .toBeDefined();
    return unconnected!;
  };
}

/**
 * muster's side of the grant: `core_auth_login` answers a challenge whose
 * sign-in tab stays blank, and once `granted` names the provider,
 * `auth://status` reports its App (or the server the manager is pinned to)
 * connected, as muster does after the provider's sign-in.
 */
async function stageGrant(
  page: Page,
  provider: Provider,
  granted: Set<string>,
) {
  const [, kind, name] =
    provider.signIn?.match(
      /core_auth_login (app|server)=([a-z0-9.-]*[a-z0-9])/,
    ) ?? [];
  expect(name, `${provider.name}'s signIn names a grant`).toBeDefined();
  await page.route('**/api/muster/auth/login**', route =>
    route.fulfill({
      json: { status: 'auth_required', authUrl: 'about:blank' },
    }),
  );
  await page.route('**/api/muster/auth/status**', async (route: Route) => {
    const answer = await (await route.fetch()).json();
    if (!granted.has(provider.name)) {
      await route.fulfill({ json: answer });
      return;
    }
    const key = kind === 'app' ? 'providerApps' : 'servers';
    const entries: Array<{ name: string; status: string }> =
      answer?.[key] ?? [];
    await route.fulfill({
      json: {
        ...answer,
        [key]: [
          ...entries.filter(entry => entry.name !== name),
          { name, status: 'connected' },
        ],
      },
    });
  });
}

/**
 * Customize · Workspaces, then its New workspace, into the editor; skips the
 * test while muster still waits for the person's sign-in to workspace-manager.
 */
async function openEditor(page: Page): Promise<void> {
  await open(page, '/customize/workspaces');
  const card = page.getByTestId('workspaces-sign-in');
  const create = page.getByRole('link', { name: 'New workspace' }).first();
  await expect(card.or(create).first()).toBeVisible();
  test.skip(
    await card.isVisible(),
    'the admin has not signed in to workspace-manager in muster (the GitHub App grant)',
  );
  await create.click();
}

/**
 * Picks the provider instance for the editor's first source where the lab
 * offers several: the prompt is for the source's own provider.
 */
async function chooseProvider(page: Page, provider: Provider): Promise<void> {
  const picker = page
    .getByRole('region', { name: 'Source 1' })
    .getByRole('button', { name: /Provider$/ });
  if ((await picker.count()) === 0) {
    return;
  }
  await picker.click();
  await page
    .getByRole('option', { name: new RegExp(`^${provider.name}\\b`, 'i') })
    .click();
}

/** The person comes back to the portal's tab from the sign-in tab. */
async function returnFocus(page: Page) {
  await page.evaluate(() => {
    window.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
  });
}

async function snapshot(page: Page, name: string): Promise<void> {
  const dir = process.env.AGENTLAB_E2E_SCREENSHOTS;
  if (dir) {
    await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
  }
}

test('the workspace editor prompts for an unconnected provider, and not once it is connected', async ({
  admin,
}) => {
  const granted = new Set<string>();
  const unconnected = await stageProviders(admin, granted);

  await openEditor(admin);
  const provider = await unconnected();
  await chooseProvider(admin, provider);
  const prompt = admin.getByTestId(`provider-connect-${provider.name}`);
  await expect(prompt).toBeVisible({ timeout: 60_000 });
  await expect(
    prompt.getByRole('button', { name: /^(Continue with|Sign in to) / }),
  ).toBeVisible();
  await snapshot(admin, 'provider-connect-editor');

  granted.add(provider.name);
  await returnFocus(admin);

  await expect(prompt).toHaveCount(0, { timeout: 30_000 });
  await expect(
    admin
      .getByRole('textbox', { name: /^Owner/ })
      .or(admin.getByRole('button', { name: /Owner$/ }))
      .first(),
    'the editor offers the provider’s owners once it is connected',
  ).toBeVisible();
});

test('the composer prompts for an unconnected provider before a workspace start, and starts again once connected', async ({
  admin,
  labAgent,
}) => {
  test.setTimeout(8 * 60_000);
  const granted = new Set<string>();
  const unconnected = await stageProviders(admin, granted);
  // The editor reads the admin's providers first: the staged check names the
  // real instance and its signIn.
  await openEditor(admin);
  const provider = await unconnected();

  const checks: ToolCall[] = [];
  await admin.route('**/api/muster/call**', async (route: Route) => {
    const call = route.request().postDataJSON() as ToolCall;
    if (call?.name === `${TOOL}list_workspaces`) {
      const answer = await (await route.fetch()).json();
      await route.fulfill({
        json: {
          ...answer,
          workspaces: [
            ...(answer?.workspaces ?? []),
            {
              name: WORKSPACE,
              organization: answer?.organizations?.[0] ?? 'lab',
              sources: [],
              sync: { schedule: 'nightly' },
              resourceVersion: '1',
              createdAt: new Date().toISOString(),
              repositories: 2,
              sessions: 0,
              lastSync: { time: new Date().toISOString(), result: 'Succeeded' },
            },
          ],
        },
      });
      return;
    }
    if (
      call?.name === `${TOOL}authorize_workspace` &&
      call.arguments?.workspace === WORKSPACE
    ) {
      checks.push(call);
      await route.fulfill({
        json: granted.has(provider.name)
          ? { workspace: WORKSPACE, outcome: 'refused', reason: STOPPED }
          : {
              workspace: WORKSPACE,
              outcome: 'connect_required',
              reason: `grant ${provider.name} first`,
              connect: [{ provider: provider.name, signIn: provider.signIn }],
            },
      });
      return;
    }
    await route.fallback();
  });

  await openReadyAgent(admin, labAgent);
  await startSessionButton(admin).click();
  const promptBox = admin.getByRole('textbox', { name: 'Prompt' });
  await expect(promptBox).toBeVisible();
  await admin.getByRole('button', { name: /Workspace/ }).click();
  await admin.getByRole('option', { name: new RegExp(WORKSPACE) }).click();
  await promptBox.fill(PROMPT);
  await admin.getByRole('button', { name: 'Start', exact: true }).click();

  const prompt = admin.getByTestId(`provider-connect-${provider.name}`);
  await expect(prompt).toBeVisible({ timeout: 60_000 });
  await expect(prompt).toContainText(`to use ${WORKSPACE}`);
  await expect(
    prompt.getByRole('button', { name: 'Start without workspace' }),
  ).toBeVisible();
  await expect(promptBox, 'the prompt stays in the box').toHaveValue(PROMPT);
  await snapshot(admin, 'provider-connect-composer');
  expect(checks).toHaveLength(1);

  // Only a sign-in the person makes here restarts the start: the click, the
  // sign-in tab, and muster reporting the grant.
  await stageGrant(admin, provider, granted);
  const signInTab = admin.waitForEvent('popup');
  await prompt
    .getByRole('button', { name: /^(Continue with|Sign in to) / })
    .click();
  await (await signInTab).close();
  await expect(prompt).toContainText(/Waiting for /);
  expect(checks, 'nothing starts before the grant').toHaveLength(1);

  granted.add(provider.name);
  await returnFocus(admin);

  await expect(prompt).toHaveCount(0, { timeout: 30_000 });
  await expect
    .poll(() => checks.length, {
      message: 'the start goes again by itself once the provider is connected',
    })
    .toBe(2);
  await expect(admin.getByText(STOPPED)).toBeVisible();
  await expect(promptBox, 'the prompt is still there').toHaveValue(PROMPT);
  await expect(admin).not.toHaveURL(/\/sessions\/[^/]+\/[^/]+$/);
});
