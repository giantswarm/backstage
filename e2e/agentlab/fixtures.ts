import {
  test as base,
  expect,
  type BrowserContext,
  type Locator,
  type Page,
} from '@playwright/test';
import { contextOptions, lab, type LabUser } from './lab';

export { expect };

/**
 * Submits the lab Dex's login form in the popup the portal opened, with the
 * fixture password unless the test passes another (the wrong-password case),
 * and waits for Dex to send the popup on: the portal's own sign-in closes it
 * from Backstage's handler page, a per-server sign-in through muster's OAuth
 * proxy lands it on muster's completion page. Either way the popup has left
 * Dex when this resolves; a popup still open is closed, the opener has what
 * it needs by then.
 */
export async function completeDexLogin(
  dex: Page,
  user: LabUser,
  password: string = lab.password,
): Promise<void> {
  await dex.waitForLoadState('domcontentloaded');
  await expect(dex, 'the popup lands on the lab Dex').toHaveURL(/\/dex\//);
  await dex.locator('input[name="login"]').fill(user.email);
  await dex.locator('input[name="password"]').fill(password);
  const closed = dex.waitForEvent('close', { timeout: 60_000 }).then(
    () => true,
    () => false,
  );
  const leftDex = dex
    .waitForURL(url => !url.pathname.includes('/dex/'), { timeout: 60_000 })
    .then(
      () => true,
      () => false,
    );
  await dex.getByRole('button', { name: 'Login' }).click();
  const done = await Promise.race([closed, leftDex]);
  expect(done, 'Dex accepted the login and sent the popup on').toBe(true);
  if (!dex.isClosed()) {
    // A completion page: give it a moment in case it closes itself, then
    // close it the way a person would.
    await Promise.race([closed, new Promise(r => setTimeout(r, 3000))]);
    if (!dex.isClosed()) {
      await dex.close();
    }
  }
}

/**
 * Signs `page` in as a lab user the way a person does: the Dex card's
 * **Sign In** opens the popup, the lab Dex asks for the fixture account, and
 * the portal renders signed in. Fails with the page's state when the card is
 * not offered (the app did not load) or the popup never closes (Dex refused,
 * or the handler page did not hand the session to the opener).
 */
export async function signIn(page: Page, user: LabUser): Promise<void> {
  await page.goto('/');
  const card = page.getByRole('button', { name: 'Sign In' });
  await expect(card, 'the sign-in page offers the Dex card').toBeVisible();
  const popup = page.waitForEvent('popup');
  await card.click();
  await completeDexLogin(await popup, user);
  await expect(
    page.getByRole('navigation', { name: 'sidebar nav' }),
    `the portal renders signed in as ${user.email}`,
  ).toBeAttached({ timeout: 60_000 });
}

/**
 * Uncaught exceptions on a page are bugs in the bundle, whatever the lab's
 * state; a failed fetch the app handles is not (those show as console errors,
 * which the lab produces in numbers — an unreachable host model server, a
 * vm-manager that is not running — and are left alone).
 */
export function watchPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  return errors;
}

type WorkerFixtures = {
  /**
   * One page per worker, signed in as the lab admin once and kept for the
   * worker's lifetime; every test navigates it.
   *
   * Why not Playwright's usual saved `storageState`, and why the page that
   * signed in stays open: the portal's session rests on Dex's refresh token,
   * which Dex rotates on every silent re-login (each page load). Two live
   * contexts holding a copy of the same cookie invalidate each other's session
   * on their next load, a state file goes stale as soon as one context used
   * it, and closing the page that just signed in cuts its first rotation
   * mid-flight — the next page then finds the sign-in card. One live page
   * per worker, no copies, is the shape that stays signed in.
   */
  adminPage: Page;
};

type TestFixtures = {
  /** The worker's admin page; an uncaught page error during the test fails it. */
  admin: Page;
  /**
   * Signs a fresh context in as the given user and returns its page; the
   * context closes with the test. For the sign-in flow itself and for what a
   * developer or viewer sees.
   */
  signInAs: (user: LabUser) => Promise<Page>;
};

export const test = base.extend<TestFixtures, WorkerFixtures>({
  adminPage: [
    async ({ browser }, use) => {
      const context = await browser.newContext(contextOptions);
      const page = await context.newPage();
      await signIn(page, lab.users.admin);
      await use(page);
      await context.close();
    },
    { scope: 'worker' },
  ],

  admin: async ({ adminPage }, use) => {
    const errors: string[] = [];
    const record = (error: Error) => errors.push(error.message);
    adminPage.on('pageerror', record);
    await use(adminPage);
    adminPage.off('pageerror', record);
    expect(errors, 'no uncaught errors on the page').toEqual([]);
  },

  signInAs: async ({ browser }, use) => {
    const contexts: BrowserContext[] = [];
    await use(async user => {
      const context = await browser.newContext(contextOptions);
      contexts.push(context);
      const page = await context.newPage();
      await signIn(page, user);
      return page;
    });
    await Promise.all(contexts.map(context => context.close()));
  },
});

/** The Agent Platform section's top-level tabs, in the order the portal shows them. */
export const agentPlatformTabs = [
  'Sessions',
  'Agents',
  'Models',
  'MCP Servers',
  'Workflows',
  'Usage',
] as const;

/**
 * Opens `path` on a signed-in page and waits for the portal's chrome, so
 * assertions see a rendered app. The sidebar is in the DOM only for a
 * signed-in app; Playwright counts its collapsed `nav` as not visible, hence
 * attached rather than visible.
 *
 * When the sign-in card shows instead — a Backstage pod roll in the shared lab
 * drops every session — the page signs in again as `user` and retries once,
 * so a lab event mid-run does not read as a portal failure.
 */
export async function open(
  page: Page,
  path: string,
  user: LabUser = lab.users.admin,
): Promise<void> {
  await page.goto(path);
  const chrome = page.getByRole('navigation', { name: 'sidebar nav' });
  const card = page.getByRole('button', { name: 'Sign In' });
  await expect(chrome.or(card).first()).toBeAttached();
  if (await card.isVisible()) {
    await signIn(page, user);
    await page.goto(path);
  }
  await expect(chrome).toBeAttached();
}

/**
 * Opens the muster session for the page's user when the page shows the gate.
 * The backend keeps that session server-side per user, so a page that
 * connected earlier in the run finds no gate — the same signed-in portal.
 * `ready` is what the page shows once connected (the servers table, a tool's
 * form), so the wait starts only once the page has settled on one or the other.
 *
 * The gate also renders while the session probe is still pending and unmounts
 * the moment the probe says authenticated, so a click can land on an element
 * that just left the DOM: click while it is there, judge by its absence.
 */
export async function connectToMuster(page: Page, ready: Locator) {
  const gate = page.getByRole('button', { name: 'Connect to muster' });
  await expect(gate.or(ready).first()).toBeVisible({ timeout: 60_000 });
  await expect
    .poll(
      async () => {
        if (!(await gate.isVisible())) {
          return 'connected';
        }
        await gate.click({ timeout: 2_000 }).catch(() => undefined);
        return 'gate';
      },
      {
        timeout: 90_000,
        intervals: [1_000],
        message:
          'the muster session did not open within 90 s — the lab muster may be unhealthy (`kubectl -n agent-platform get pods`), or the backend cached an unreachable probe after a pod roll (5 min TTL)',
      },
    )
    .toBe('connected');
}

/**
 * Creates an agent in the New agent wizard the way a person does, as the
 * page's user: Details (no skills, no tools, the lab's default ModelConfig),
 * agent-manager's dry run on Review, then Deploy. Resolves on the agent's
 * detail page and returns its path; from then on the agent exists and the
 * caller deletes it with {@link deleteAgentInPortal}, whatever happens next.
 */
export async function createAgentInWizard(
  page: Page,
  agentName: string,
  agentSlug: string,
): Promise<string> {
  // --- Step 1: Details -----------------------------------------------------
  await open(page, '/agent-platform/agents/new');
  await expect(page.getByText('Step 1 of 4: Details')).toBeVisible();
  await expect(
    page.getByText('No installations with models'),
    `the wizard sees no reachable installation with a ModelConfig — the lab's kagent route may be unreachable from Backstage, or the backend cached an unreachable probe after a pod roll (5 min TTL)`,
  ).toBeHidden();
  await page.getByRole('textbox', { name: 'Name' }).fill(agentName);
  await expect(page.getByRole('textbox', { name: 'Slug' })).toHaveValue(
    agentSlug,
  );
  await page
    .getByRole('textbox', { name: 'Description' })
    .fill('Throwaway agent of the Playwright suite; deleted by the same run.');
  await page
    .getByRole('textbox', { name: 'System prompt' })
    .fill('You are a test agent. Answer with exactly what you are asked for.');
  await page
    .getByRole('radiogroup', { name: 'Model' })
    .getByRole('radio', { name: /default-model-config/ })
    .check();
  await page.getByRole('button', { name: 'Continue' }).first().click();

  // --- Step 2: Skills (none) -----------------------------------------------
  await expect(page.getByText('Step 2 of 4: Skills')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).first().click();

  // --- Step 3: Tools (none) ------------------------------------------------
  await expect(page.getByText('Step 3 of 4: Tools')).toBeVisible();
  await expect(
    page.getByLabel('Selected so far').getByText('No tools'),
    'nothing selected is the empty toolset, and the step says so',
  ).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).first().click();

  // --- Step 4: Review = agent-manager's dry run, then Deploy ---------------
  await expect(page.getByText('Step 4 of 4: Review')).toBeVisible();
  await expect(page.getByText(agentSlug).first()).toBeVisible();
  const deploy = page.getByRole('button', { name: 'Deploy agent' }).first();
  await expect(
    deploy,
    'the dry run through agent-manager completed and Deploy is offered',
  ).toBeEnabled({ timeout: 90_000 });
  await deploy.click();

  // The review page hands the agent to its detail page, which reports the
  // verdict agent-manager polls for it. From here on the agent exists and the
  // run deletes it again, whatever happens in between.
  await expect(page).toHaveURL(
    new RegExp(
      `/agent-platform/agents/${lab.installation}/[^/]+/${agentSlug}$`,
    ),
    { timeout: 60_000 },
  );
  return new URL(page.url()).pathname;
}

/** Deletes the agent through its actions menu — the portal's own path. */
export async function deleteAgentInPortal(
  page: Page,
  detailPath: string,
  agentSlug: string,
): Promise<void> {
  await open(page, detailPath);
  await page.getByRole('button', { name: 'Agent actions' }).click();
  await page.getByRole('menuitem', { name: /Delete agent/ }).click();
  const dialog = page.getByRole('dialog', { name: /Delete agent/ });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Delete agent' }).click();
  await expect(page).toHaveURL(/\/agent-platform\/agents$/, {
    timeout: 60_000,
  });
  await expect(
    page.getByRole('link', { name: agentSlug }),
    'the roster no longer lists the agent',
  ).toBeHidden({ timeout: 60_000 });
}

/**
 * On an agent's detail page: waits for the agent to become ready on the
 * platform Harness, then starts a session with `prompt` from the page and
 * resolves on the new session's page. `whileStarting` runs against the New
 * session dialog while the create is held on its way to kagent, and the
 * create goes on once it returns.
 */
export async function startSessionOnReadyAgent(
  page: Page,
  prompt: string,
  whileStarting?: (dialog: Locator) => Promise<void>,
): Promise<void> {
  // The header's verdict — the page's own derivation from the template's
  // harness status, `Pending` until the golden boot is done. Tagged, since
  // the Status card's conditions list carries a `Ready` condition too.
  await expect(
    page.getByTestId('agent-readiness').getByText('Ready', { exact: true }),
    'the agent becomes ready on the platform Harness (golden boot) — a Pending that never ends means the lab Harness is not admitting: `kubectl -n kagent get harness,workerpools` and the kagent-controller log',
  ).toBeVisible({ timeout: 6 * 60_000 });

  // --- Start a session from the agent's page and get an answer -----------
  // The button follows the roster's own read of the agent (`readiness`),
  // polled apart from the header's harness status above, so it can trail
  // the header's Ready by more than an action timeout.
  const startSession = page.getByRole('button', { name: 'Start a session' });
  await expect(
    startSession,
    'the page offers a session once the roster reads the agent ready',
  ).toBeVisible({ timeout: 60_000 });
  await startSession.click();
  const promptBox = page.getByRole('textbox', { name: 'Prompt' });
  await expect(promptBox).toBeVisible();
  await promptBox.fill(prompt);
  let release: () => void = () => {};
  let reached: () => void = () => {};
  const held = new Promise<void>(resolve => (release = resolve));
  const onItsWay = new Promise<void>(resolve => (reached = resolve));
  const createSession = /\/api\/agent-platform\/kagent\/sessions\?/;
  if (whileStarting) {
    await page.route(createSession, async route => {
      reached();
      await held;
      await route.continue();
    });
  }
  // Exact: the page header's "Start a session" is a button too.
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  if (whileStarting) {
    try {
      await onItsWay;
      await whileStarting(page.getByRole('dialog', { name: 'New session' }));
    } finally {
      // Released, the route passes every later call straight through.
      release();
    }
  }
  await expect(page).toHaveURL(
    new RegExp(`/agent-platform/sessions/${lab.installation}/[^/]+$`),
    { timeout: 60_000 },
  );
}
