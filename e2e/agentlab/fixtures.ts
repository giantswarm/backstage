import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  test as base,
  expect,
  type APIRequestContext,
  type BrowserContext,
  type Dialog,
  type Locator,
  type Page,
  type Request,
  type Response,
} from '@playwright/test';
import {
  LEFTOVER_AGE,
  contextOptionsFor,
  lab,
  type LabUser,
  type PortalMode,
  type Variant,
} from './lab';

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
 * The portal's chrome on whatever page is open: the classic sidebar
 * (`sidebar nav`) or, on the agent shell's routes of a lab in `shell` mode,
 * the shell's rail or phone bar (`Main`). In the DOM only for a signed-in app.
 */
export function portalChrome(page: Page): Locator {
  return page
    .getByRole('navigation', { name: 'sidebar nav' })
    .or(page.getByRole('navigation', { name: 'Main', exact: true }))
    .first();
}

/**
 * Which portals the lab's Backstage serves, from the app config it publishes
 * before sign-in: the frontend config `app-backend` injects into `index.html`
 * (`<script type="backstage.io/config">`), the one the app reads at start.
 * `app.portals.agentPlatform` on is the shell; the last config that sets it
 * wins, as in Backstage's `ConfigReader.fromConfigs`. A fresh browser context
 * carries no person's opt-in flag, so this is what the suite's pages render.
 */
export async function servedPortalMode(
  request: APIRequestContext,
): Promise<PortalMode> {
  const response = await request.get('/');
  expect(
    response.ok(),
    `the lab's Backstage answers / (${response.status()})`,
  ).toBe(true);
  const injected =
    /<script type="backstage\.io\/config">([\s\S]*?)<\/script>/.exec(
      await response.text(),
    );
  expect(
    injected,
    "the lab's Backstage injects its frontend config into index.html",
  ).not.toBeNull();
  const configs: {
    data?: { app?: { portals?: { agentPlatform?: unknown } } };
  }[] = JSON.parse(injected![1]);
  const agentPlatform = configs
    .map(config => config.data?.app?.portals?.agentPlatform)
    .filter(value => value !== undefined)
    .pop();
  return agentPlatform === true || agentPlatform === 'true'
    ? 'shell'
    : 'classic';
}

/**
 * Settles, before a test, whether the lab serves the portals
 * `AGENTLAB_PORTAL_MODE` says, and fails at once with what to change on any
 * mismatch, rather than letting every spec fail on a missing route or the
 * other chrome. A run that asks for the shell on a lab serving the classic
 * portal only fails too, never skips: a green run of the Agent Platform's
 * projects then proves the shell.
 */
function expectLabPortalMode(served: PortalMode): void {
  expect(
    served,
    lab.portalMode === 'shell'
      ? "AGENTLAB_PORTAL_MODE=shell, but the lab's Backstage serves the classic portal only: its frontend config carries no app.portals.agentPlatform. A Backstage before 3.x has no Agent Platform shell and injects none; on 3.x, turn it on (agentlab's backstage.portal: agent-platform, or APP_CONFIG_app_portals_agentPlatform=true, see e2e/agentlab/README.md)"
      : 'the lab serves the agent shell: set AGENTLAB_PORTAL_MODE=shell (the Agent Platform specs need it), or switch the lab back to the classic portal',
  ).toBe(lab.portalMode);
}

/**
 * Opens `path` and, when the load lost one of the app's scripts, loads it
 * once more.
 *
 * A Chromium that has just started changes its certificate verifier once,
 * about two seconds in, and every request in flight at that moment fails
 * (`net::ERR_CERT_VERIFIER_CHANGED`, the rest `net::ERR_FAILED`). Caught in
 * the first page load of a new browser — a worker's sign-in, a test's own
 * `page` — the app's script chunks are among them, and the page stays blank:
 * neither the portal nor the sign-in card. A second load comes after the
 * change. A load that loses its scripts again is left as it is, for the
 * caller's assertion to report.
 */
export async function gotoApp(page: Page, path: string): Promise<void> {
  const lost: string[] = [];
  const record = (request: Request) => {
    if (
      request.resourceType() === 'script' &&
      request.frame() === page.mainFrame()
    ) {
      lost.push(`${request.url()} (${request.failure()?.errorText})`);
    }
  };
  page.on('requestfailed', record);
  try {
    await page.goto(path);
  } finally {
    page.off('requestfailed', record);
  }
  if (lost.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(
      `agentlab e2e: ${path} lost ${lost.length} script(s), loading it again: ${lost[0]}`,
    );
    await page.goto(path);
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
  await gotoApp(page, '/');
  // The classic card's "Sign In" and the shell card's "Sign in with …" alike
  // (a case-insensitive substring).
  const card = page.getByRole('button', { name: 'Sign In' });
  await expect(card, 'the sign-in page offers the Dex card').toBeVisible();
  const popup = page.waitForEvent('popup');
  await card.click();
  await completeDexLogin(await popup, user);
  await expect(
    portalChrome(page),
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
   * The browser the project drives (`use: { variant }` in
   * `playwright.config.ts`): `desktop`, or the `agentlab-mobile` project's
   * phone. Every context the fixtures open takes its options from it.
   */
  variant: Variant;
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
  /** Which portals the lab serves, read once per worker ({@link servedPortalMode}). */
  servedPortal: PortalMode;
  /**
   * An agent of the worker's own on the lab, created as the admin in the New
   * agent wizard (agent-manager's `create_agent` through muster) the first
   * time a test asks for it, and deleted again when the worker ends, also
   * after a failed test, on a fresh sign-in where the worker's page cannot
   * ({@link removeAgent}). Before creating it, the worker deletes the agents
   * earlier runs left ({@link isLeftoverAgent}): a killed worker never reaches
   * its teardown. A spec that needs an agent on the roster uses this one,
   * never whatever earlier runs left on a shared lab; one that needs it ready
   * opens it with {@link openReadyAgent}. A failed creation fails every later
   * request for it in the same run at once, with the first failure's message.
   */
  labAgent: LabAgent;
};

/** The worker's {@link WorkerFixtures.labAgent}. */
export interface LabAgent {
  /** The display name the roster and the session pages show. */
  name: string;
  slug: string;
  /** The agent's detail page, `/customize/agents/<installation>/<ns>/<slug>`. */
  detailPath: string;
}

type TestFixtures = {
  /**
   * Run before every test (auto): whether the lab serves the portals
   * `AGENTLAB_PORTAL_MODE` says ({@link expectLabPortalMode}).
   */
  labPortalMode: void;
  /** The worker's admin page; an uncaught page error during the test fails it. */
  admin: Page;
  /**
   * Signs a fresh context in as the given user and returns its page; the
   * context closes with the test. For the sign-in flow itself and for what a
   * developer or viewer sees.
   */
  signInAs: (user: LabUser) => Promise<Page>;
};

/** The prefix of every agent's technical name the `labAgent` fixture creates. */
export const LAB_AGENT_PREFIX = 'e2e-roster-';

/**
 * The plugins persist their react-query caches in localStorage, which the
 * worker's page keeps from one test to the next: an answer a test staged at
 * the browser would be read back from there by the next test's page load,
 * without a request any route sees. The admin page drops both caches on the
 * first navigation after every test, before the app runs; clearing them from
 * the running page would race a throttled write.
 *
 * The forms' drafts (`useSessionDraft`, keys starting with
 * {@link FORM_DRAFT_PREFIX}) go at the same moment: the tab keeps them, so a
 * test that typed into the New agent wizard without creating would otherwise
 * hand the next test a prefilled wizard.
 */
const PERSISTED_QUERY_CACHES = [
  'agent-platform-react-query-cache',
  'gs-react-query-cache',
];
const FORM_DRAFT_PREFIX = 'gs-draft:';
const DROP_CACHES_FLAG = 'e2e-drop-persisted-caches-after-test';

/** Where a worker records a failed `labAgent` setup for the rest of the run. */
function labAgentFailureFile(outputDir: string): string {
  return join(outputDir, 'lab-agent-setup-failed.txt');
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  variant: ['desktop', { scope: 'worker', option: true }],

  servedPortal: [
    async ({ playwright }, use) => {
      const request = await playwright.request.newContext({
        baseURL: lab.baseURL,
        ignoreHTTPSErrors: true,
      });
      try {
        await use(await servedPortalMode(request));
      } finally {
        await request.dispose();
      }
    },
    { scope: 'worker' },
  ],

  labPortalMode: [
    async ({ servedPortal }, use) => {
      expectLabPortalMode(servedPortal);
      await use();
    },
    { auto: true },
  ],

  adminPage: [
    async ({ browser, variant }, use) => {
      const context = await browser.newContext(contextOptionsFor(variant));
      const page = await context.newPage();
      await page.addInitScript(
        ([keys, flag, draftPrefix]) => {
          if (window.sessionStorage.getItem(flag)) {
            window.sessionStorage.removeItem(flag);
            keys.forEach(key => window.localStorage.removeItem(key));
            Object.keys(window.sessionStorage)
              .filter(key => key.startsWith(draftPrefix))
              .forEach(key => window.sessionStorage.removeItem(key));
          }
        },
        [PERSISTED_QUERY_CACHES, DROP_CACHES_FLAG, FORM_DRAFT_PREFIX] as const,
      );
      await signIn(page, lab.users.admin);
      await use(page);
      await context.close();
    },
    { scope: 'worker' },
  ],

  labAgent: [
    async ({ adminPage, browser, variant }, use, workerInfo) => {
      // One failed creation is the run's answer: a later worker fails at once
      // instead of paying the wizard and its timeouts again.
      const failureFile = labAgentFailureFile(workerInfo.project.outputDir);
      if (existsSync(failureFile)) {
        throw new Error(
          `the fixture agent could not be created earlier in this run: ${readFileSync(failureFile, 'utf8')}`,
        );
      }
      await removeLeftoverAgents(adminPage);
      // Unique to the run, the worker and the second, so two runs against a
      // shared lab never meet on one agent.
      const stamp = labAgentStamp(new Date());
      const suffix = `${randomUUID().slice(0, 6)}-${workerInfo.workerIndex}`;
      const name = `E2E Roster ${stamp} ${suffix.replace('-', ' ')}`;
      const slug = `${LAB_AGENT_PREFIX}${stamp}-${suffix}`;
      let detailPath: string | undefined;
      try {
        try {
          detailPath = await createAgentInWizard(adminPage, name, slug);
        } catch (error) {
          mkdirSync(workerInfo.project.outputDir, { recursive: true });
          writeFileSync(failureFile, String(error));
          throw error;
        } finally {
          await restoreInboxToasts(adminPage);
        }
        await use({ name, slug, detailPath });
      } finally {
        await removeAgent(
          adminPage,
          () => browser.newContext(contextOptionsFor(variant)),
          { name, slug, detailPath },
        );
      }
    },
    // The sweep, the wizard and the deletion's wait for Flux each take minutes.
    { scope: 'worker', timeout: 10 * 60_000 },
  ],

  admin: async ({ adminPage }, use) => {
    const errors: string[] = [];
    const record = (error: Error) => errors.push(error.message);
    // An agent without an avatar is a 404 the portal shows as initials; a 502
    // is the backend failing, on whichever page lists agents.
    const badAvatars: string[] = [];
    const recordAvatar = (response: Response) => {
      if (
        response.status() === 502 &&
        response.url().includes('/api/agent-platform/avatars/')
      ) {
        badAvatars.push(response.url());
      }
    };
    adminPage.on('pageerror', record);
    adminPage.on('response', recordAvatar);
    await use(adminPage);
    adminPage.off('pageerror', record);
    adminPage.off('response', recordAvatar);
    // The page outlives the test: a route a test left behind (a swapped
    // token, a stubbed answer) must not answer the next test's requests.
    await adminPage.unrouteAll({ behavior: 'ignoreErrors' });
    await restoreInboxToasts(adminPage);
    await adminPage
      .evaluate(
        flag => window.sessionStorage.setItem(flag, '1'),
        DROP_CACHES_FLAG,
      )
      .catch(() => undefined);
    // Soft, so one failing does not hide the other.
    expect.soft(errors, 'no uncaught errors on the page').toEqual([]);
    expect.soft(badAvatars, 'no avatar answered 502').toEqual([]);
  },

  signInAs: async ({ browser, variant }, use) => {
    const contexts: BrowserContext[] = [];
    await use(async user => {
      const context = await browser.newContext(contextOptionsFor(variant));
      contexts.push(context);
      const page = await context.newPage();
      await signIn(page, user);
      return page;
    });
    await Promise.all(contexts.map(context => context.close()));
  },
});

/**
 * Opens `path` on a signed-in page and waits for the portal's chrome (the
 * classic sidebar or the shell's rail, {@link portalChrome}), so assertions
 * see a rendered app. The chrome is in the DOM only for a signed-in app;
 * Playwright counts the classic sidebar's collapsed `nav` as not visible,
 * hence attached rather than visible.
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
  await gotoApp(page, path);
  const chrome = portalChrome(page);
  const card = page.getByRole('button', { name: 'Sign In' });
  await expect(chrome.or(card).first()).toBeAttached();
  // Signed out only without the portal's chrome: a signed-in page has its own
  // "Sign in" buttons too (the inbox's MCP sign-in row and its dialog).
  if ((await chrome.count()) === 0 && (await card.isVisible())) {
    await signIn(page, user);
    await gotoApp(page, path);
  }
  await expect(chrome).toBeAttached();
}

/**
 * Reloads `page` like a person pressing reload: a `beforeunload` prompt the
 * page raises (a wizard with input does) is accepted, so the reload goes
 * through. Only for this reload; any other dialog meanwhile is dismissed.
 */
export async function reloadAccepting(page: Page): Promise<void> {
  const onDialog = (dialog: Dialog) =>
    dialog.type() === 'beforeunload' ? dialog.accept() : dialog.dismiss();
  page.on('dialog', onDialog);
  try {
    await page.reload();
  } finally {
    page.off('dialog', onDialog);
  }
}

/**
 * Fills the New agent wizard's Details step: the name, what it is for and its
 * instructions, then waits until the step names the model the agent runs on
 * ("Runs on …"), which it does once the environment's ModelConfigs are read
 * and one is preselected — a Continue before that is refused for the model.
 */
export async function fillAgentDetails(
  page: Page,
  details: { name: string; description: string; instructions: string },
): Promise<void> {
  await expectWizardStep(page, 'Details');
  await page
    .getByRole('textbox', { name: 'Name', exact: true })
    .fill(details.name);
  await page
    .getByRole('textbox', { name: 'What is it for?' })
    .fill(details.description);
  await page
    .getByRole('textbox', { name: 'Instructions' })
    .fill(details.instructions);
  await expect(
    page.getByText(/^Runs on /),
    'a model is preselected for the agent',
  ).toBeVisible({ timeout: 60_000 });
}

/**
 * Opens the New agent wizard's **More options** disclosure on Details — its
 * summary reads "More options · <harness>", and the plain view's model line
 * ("Runs on … · change under More options") names it too, so the summary is
 * found as the disclosure, not by the words alone.
 */
export async function openWizardMoreOptions(page: Page): Promise<void> {
  await page
    .locator('summary')
    .filter({ hasText: /^More options/ })
    .click();
}

/**
 * Asserts the in-content wizard frame is on `step`: the step strip marks it
 * as the current one. Replaces the old "Step N of M: <label>" line the pages
 * carried before the shared `WizardFrame`.
 */
export async function expectWizardStep(page: Page, step: string) {
  await expect(
    page
      .getByRole('list', { name: 'Steps' })
      .locator('li[aria-current="step"]'),
  ).toContainText(step);
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
 * Opens the admin page's home screen on the agents as they are now. The portal
 * writes its cache to localStorage at most every 30 s and trusts an entry for
 * 60 s, so a load right after the fixture agent turned Ready elsewhere would
 * restore the list from before it existed and not ask again: the admin page's
 * init script drops the persisted caches on this load, before the app runs,
 * and the home reads the roster afresh.
 */
export async function openHome(admin: Page): Promise<void> {
  await admin.evaluate(
    flag => window.sessionStorage.setItem(flag, '1'),
    DROP_CACHES_FLAG,
  );
  await open(admin, '/');
}

/**
 * The Notification inbox's toasts a fresh tab meets: the one summary of what
 * was unread at the tab's first read ("2 notifications need your attention")
 * and a new MCP sign-in row's ("1 MCP server needs your sign-in"). While a
 * connector waits for the person's sign-in (the lab's `lab-oauth-fixture`
 * does), a fresh tab raises one at the foot of the page. It stands clear of
 * the bottom bar, a docked composer and a wizard's footer, but covers the foot
 * of the content: on a phone, Technical details at the foot of Review. It goes
 * on its own after 6 s, but not while the pointer rests on it: an action on a
 * control it covers moves the pointer onto it and holds it there, and on a
 * page whose clock the test installed its time does not pass either.
 */
function inboxToast(page: Page): Locator {
  return page
    .getByRole('alertdialog')
    .filter({ hasText: /needs? your (attention|sign-in)/ });
}

/**
 * Closes the inbox's toasts ({@link inboxToast}) whenever one shows in the
 * way of an action, as a person does who does not wait for it to go. An open
 * select's underlay takes every click outside its listbox, so the listbox is
 * closed first. The worker's shared page is restored by its fixtures
 * ({@link restoreInboxToasts}).
 */
export async function dismissInboxToasts(page: Page): Promise<void> {
  await page.addLocatorHandler(inboxToast(page), async toast => {
    if (await page.getByRole('listbox').isVisible()) {
      await page.keyboard.press('Escape');
    }
    // The toast may go on its own between being seen and the click: then
    // there is nothing left to close.
    await toast
      .getByRole('button', { name: 'Close' })
      .click({ timeout: 2_000 })
      .catch(() => undefined);
  });
}

/**
 * Undoes {@link dismissInboxToasts} on a page that outlives the test, so the
 * next test sees the toasts.
 */
async function restoreInboxToasts(page: Page): Promise<void> {
  await page.removeLocatorHandler(inboxToast(page));
}

/**
 * Creates an agent in the New agent wizard the way a person does, as the
 * page's user: Details (no skills, no tools, the lab's default ModelConfig
 * unless `model` names another: the model radio's name, which is the
 * model's display name where it has one),
 * agent-manager's dry run on Review, then Create agent. Resolves on the agent's
 * detail page and returns its path; from then on the agent exists and the
 * caller deletes it with {@link deleteAgentInPortal}, whatever happens next.
 *
 * Where the person may create agents in several tenants (agent-manager's
 * `get_info` `namespaces.managed`), the wizard offers no model until one is
 * picked: `options.tenant` (default the platform tenant, `platform`). The only
 * tenant is picked by the wizard itself.
 *
 * `options.harness` picks that Runtime card under More options instead of the
 * platform Harness; `options.onStep` runs on Details (once the pick is made),
 * Skills, Tools (once the empty toolset is shown) and Review (once the dry run
 * completed), before each Continue or Create.
 */
export async function createAgentInWizard(
  page: Page,
  agentName: string,
  agentSlug: string,
  options: {
    harness?: RegExp;
    model?: string | RegExp;
    tenant?: string;
    /**
     * Runs on a step before its Continue; on Skills or Tools, it may pick
     * some.
     */
    onStep?: (step: 'Details' | 'Skills' | 'Tools' | 'Review') => Promise<void>;
  } = {},
): Promise<string> {
  // A toast covers the foot of the content: on a phone, Technical details at
  // the foot of Review.
  await dismissInboxToasts(page);
  // --- Step 1: Details -----------------------------------------------------
  await open(page, '/customize/agents/new');
  await expectWizardStep(page, 'Details');
  await expect(
    page.getByText('No environments with models'),
    `the wizard sees no reachable installation with a ModelConfig — the lab's kagent route may be unreachable from Backstage, or the backend cached an unreachable probe after a pod roll (5 min TTL)`,
  ).toBeHidden();
  await page
    .getByRole('textbox', { name: 'Name', exact: true })
    .fill(agentName);
  // The technical name sits behind "More options", derived from the name.
  await openWizardMoreOptions(page);
  await expect(
    page.getByRole('textbox', { name: 'Technical name' }),
  ).toHaveValue(agentSlug);
  await page
    .getByRole('textbox', { name: 'What is it for?' })
    .fill('Throwaway agent of the Playwright suite; deleted by the same run.');
  await page
    .getByRole('textbox', { name: 'Instructions' })
    .fill('You are a test agent. Answer with exactly what you are asked for.');
  const model = page
    .getByRole('radiogroup', { name: 'Model' })
    .getByRole('radio', { name: options.model ?? /default-model-config/ });
  // The Select's name is its value and its label: "Select an option Tenant".
  const tenantPicker = page.getByRole('button', { name: /\bTenant$/ });
  await expect(model.or(tenantPicker).first()).toBeVisible({ timeout: 60_000 });
  // Until agent-manager's get_info answers, the models are offered before the
  // tenants are known: decide on the tenant only once they are.
  await expect(
    page.getByText('Reading where you may create agents…'),
  ).toBeHidden({ timeout: 60_000 });
  if (await tenantPicker.isVisible()) {
    await tenantPicker.click();
    await page
      .getByRole('option', { name: options.tenant ?? 'platform', exact: true })
      .click();
  }
  await model.check();
  if (options.harness) {
    await page
      .getByRole('radiogroup', { name: 'Runtime' })
      .getByRole('radio', { name: options.harness })
      .click();
  }
  await options.onStep?.('Details');
  await page.getByRole('button', { name: 'Continue' }).first().click();

  // --- Step 2: Skills (none, unless onStep picks some) ----------------------
  await expectWizardStep(page, 'Skills');
  await options.onStep?.('Skills');
  await page.getByRole('button', { name: 'Continue' }).first().click();

  // --- Step 3: Tools (none, unless onStep picks some) -----------------------
  await expectWizardStep(page, 'Tools');
  // A new agent starts on "Nothing outside the chat". What is selected so far
  // shows in the docked *Selected* rail where the step keeps its column beside
  // it on a desktop, else in the *Selected so far* bar (a phone, a tablet).
  await expect(
    page
      .getByRole('complementary', { name: 'Selected' })
      .or(page.getByRole('region', { name: 'Selected so far' }))
      .getByText('No tools', { exact: true }),
    'nothing selected is the empty toolset, and the step says so',
  ).toBeVisible();
  await options.onStep?.('Tools');
  await page.getByRole('button', { name: 'Continue' }).first().click();

  // --- Step 4: Check and create = agent-manager's dry run, then Create -----
  await expectWizardStep(page, 'Review');
  await expect(page.getByText(agentName).first()).toBeVisible();
  const deploy = page.getByRole('button', { name: 'Create agent' }).first();
  await expect(
    deploy,
    'the dry run through agent-manager completed and Create is offered',
  ).toBeEnabled({ timeout: 90_000 });
  // The release and its manifests are collapsed under Technical details.
  await page.getByText('Technical details').click();
  await expect(page.getByText(agentSlug).first()).toBeVisible();
  await options.onStep?.('Review');
  await deploy.click();

  // The review page hands the agent to its detail page, which reports the
  // verdict agent-manager polls for it. From here on the agent exists and the
  // run deletes it again, whatever happens in between.
  await expect(page).toHaveURL(
    new RegExp(`/customize/agents/${lab.installation}/[^/]+/${agentSlug}$`),
    { timeout: 60_000 },
  );
  return new URL(page.url()).pathname;
}

/**
 * How long an agent the wizard created may stay Deploying before its page
 * renders it. The first agent in a namespace waits for Flux to pull the agent
 * chart from the registry (its OCIRepository "building artifact"), which on a
 * cold lab takes minutes.
 */
export const AGENT_RENDER_TIMEOUT = 6 * 60_000;

/**
 * On an agent's open detail page: waits until the page renders the Agent, past
 * Deploying — the header's actions menu, which the page offers only then.
 */
export async function expectAgentRendered(page: Page): Promise<void> {
  await expect(
    page.getByRole('button', { name: 'Agent actions' }),
    'the agent leaves Deploying once Flux pulled the agent chart and helm-controller rendered the Agent: `kubectl get ocirepositories,helmreleases -A` and the source-controller log',
  ).toBeVisible({ timeout: AGENT_RENDER_TIMEOUT });
}

/** Deletes the agent through its actions menu — the portal's own path. */
export async function deleteAgentInPortal(
  page: Page,
  detailPath: string,
  agentSlug: string,
): Promise<void> {
  await requestAgentDeletion(page, detailPath);
  await expectAgentsGone(page, [agentSlug]);
}

/**
 * Deletes the agent through its actions menu and resolves back on the agents
 * list, before the roster drops it ({@link expectAgentsGone}). An agent still
 * Deploying has no menu yet: the deletion waits for it
 * ({@link expectAgentRendered}), so a test that failed early still removes it.
 */
async function requestAgentDeletion(
  page: Page,
  detailPath: string,
): Promise<void> {
  await open(page, detailPath);
  await expectAgentRendered(page);
  await page.getByRole('button', { name: 'Agent actions' }).click();
  await page.getByRole('menuitem', { name: /Delete agent/ }).click();
  const dialog = page.getByRole('dialog', { name: /Delete agent/ });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Delete agent' }).click();
  // Back on the agents list: Customize's Agents tab.
  await expect(page).toHaveURL(/\/customize\/agents$/, {
    timeout: 60_000,
  });
}

/** Waits on the open agents list until the roster lists none of `slugs`. */
async function expectAgentsGone(page: Page, slugs: string[]): Promise<void> {
  // By the href: the link's name is the display name, not the slug. The
  // roster re-reads the Agents on its 60 s poll, and the Agent goes only once
  // Flux has uninstalled the release agent-manager deleted, so allow two
  // polls.
  await expect(
    page.locator(slugs.map(slug => `a[href$="/${slug}"]`).join(', ')),
    `the roster no longer lists ${slugs.join(', ')}`,
  ).toHaveCount(0, { timeout: 150_000 });
}

/** The `labAgent` stamp of `date`: its UTC month to second, `MMDDhhmmss`. */
export function labAgentStamp(date: Date): string {
  return date.toISOString().replace(/[-:T]/g, '').slice(4, 14);
}

/**
 * Whether `slug` names a `labAgent` an earlier run left: created, by its
 * stamp, more than {@link LEFTOVER_AGE} ago. The stamp has no year: one later
 * than an hour from now is last year's.
 */
export function isLeftoverAgent(
  slug: string,
  now: number = Date.now(),
): boolean {
  const stamp = slug.match(
    new RegExp(`^${LAB_AGENT_PREFIX}(\\d{2})(\\d{2})(\\d{2})(\\d{2})(\\d{2})-`),
  );
  if (!stamp) {
    return false;
  }
  const [month, day, hour, minute, second] = stamp.slice(1).map(Number);
  const year = new Date(now).getUTCFullYear();
  const at = (y: number) => Date.UTC(y, month - 1, day, hour, minute, second);
  const created = at(year) > now + 60 * 60_000 ? at(year - 1) : at(year);
  return now - created > LEFTOVER_AGE;
}

/**
 * Deletes every `labAgent` earlier runs left ({@link isLeftoverAgent}) through
 * the portal, all requested first and then awaited together. What does not go
 * is reported, not thrown: it belongs to no run going on, so it does not fail
 * this one.
 */
async function removeLeftoverAgents(page: Page): Promise<void> {
  await open(page, '/customize/agents');
  const rows = page.getByRole('main').getByRole('listitem').getByRole('link');
  if (
    !(await rows
      .first()
      .waitFor({ timeout: 30_000 })
      .then(
        () => true,
        () => false,
      ))
  ) {
    return;
  }
  await searchRoster(page, 'E2E Roster');
  const leftovers = (
    await rows.evaluateAll(links =>
      links.map(link => link.getAttribute('href') ?? ''),
    )
  ).filter(href => isLeftoverAgent(href.split('/').pop() ?? ''));
  const requested: string[] = [];
  const failed: string[] = [];
  for (const href of leftovers) {
    const slug = href.split('/').pop()!;
    await requestAgentDeletion(page, href).then(
      () => requested.push(slug),
      (error: Error) =>
        failed.push(`${slug} (${error.message.split('\n')[0]})`),
    );
  }
  if (requested.length > 0) {
    await expectAgentsGone(page, requested).catch((error: Error) =>
      failed.push(error.message.split('\n')[0]),
    );
  }
  if (failed.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(`labAgent: leftovers not removed: ${failed.join('; ')}`);
  }
}

/**
 * Deletes an agent a test or fixture created in the wizard, whatever happened
 * since: on the admin's page, and where that page cannot (a test ended its
 * session, the page crashed) again on a fresh context signed in as the admin,
 * where the roster tells whether it is still there. Without `detailPath` (the
 * hand-off to the agent's page failed) the roster's link is the way to it.
 */
export async function removeAgent(
  adminPage: Page,
  newContext: () => Promise<BrowserContext>,
  agent: { name: string; slug: string; detailPath?: string },
): Promise<void> {
  const remove = async (page: Page, detailPath?: string) => {
    // Deploy may have created the agent even when the hand-off to its page
    // failed: then the roster's link is the way to it.
    const path = detailPath ?? (await rosterPathOf(page, agent.name));
    if (path) {
      await deleteAgentInPortal(page, path, agent.slug);
    }
  };
  try {
    await remove(adminPage, agent.detailPath);
  } catch (first) {
    const context = await newContext();
    try {
      const page = await context.newPage();
      await signIn(page, lab.users.admin);
      await remove(page);
    } catch (second) {
      throw new Error(
        `the agent ${agent.slug} could not be deleted: ${first}; on a fresh sign-in: ${second}`,
      );
    } finally {
      await context.close();
    }
  }
}

/**
 * The roster's link to the agent named `name`, on the open Agents tab
 * (Customize's): one row per agent, the whole row a link to its page, named by
 * all it shows — so the row is found by the name line itself. Only the
 * roster's lists ("Agents", and "Favorite agents" once the person has some):
 * the tab's "Last used by you" cards and the rail's sessions name an agent
 * too, once a session ran on it earlier in the run.
 */
export function rosterLinkOf(page: Page, name: string): Locator {
  return page
    .getByRole('main')
    .getByRole('list', { name: /^(Favorite agents|Agents)$/ })
    .getByRole('link')
    .filter({ has: page.getByText(name, { exact: true }) });
}

/**
 * Narrows the open Agents tab to `name` where the tab offers its search (from
 * eight agents on), so a row beyond the first page is on screen.
 */
export async function searchRoster(page: Page, name: string): Promise<void> {
  const search = page.getByRole('searchbox', { name: 'Search agents' });
  if (await search.isVisible()) {
    await search.fill(name);
  }
}

/** The detail page of the roster's agent named `name`, if the roster lists it. */
async function rosterPathOf(
  page: Page,
  name: string,
): Promise<string | undefined> {
  await open(page, '/customize/agents');
  await searchRoster(page, name);
  const link = rosterLinkOf(page, name);
  await link.waitFor({ timeout: 30_000 }).catch(() => undefined);
  return (await link.count()) === 1
    ? ((await link.getAttribute('href')) ?? undefined)
    : undefined;
}

/**
 * The agent detail page's header button that starts a session with the agent:
 * **Use this agent**, offered once the agent is ready. Everywhere else the verb
 * is "Start a session" (T98), including the Sessions tab's empty state.
 */
export function startSessionButton(page: Page): Locator {
  return page.getByRole('button', { name: 'Use this agent', exact: true });
}

/**
 * Opens the agent's detail page and waits until it offers a session: the
 * button follows the roster's read of the agent, offered once the golden boot
 * on the platform Harness is done.
 */
export async function openReadyAgent(
  page: Page,
  agent: LabAgent,
): Promise<void> {
  await open(page, agent.detailPath);
  await expect(
    startSessionButton(page),
    'the fixture agent becomes ready on the platform Harness (golden boot): `kubectl -n kagent get agents,harness,workerpools` and the kagent-controller log',
  ).toBeVisible({ timeout: 6 * 60_000 });
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
  // The header's verdict — the page's own derivation from the Agent's
  // conditions, `Pending` until the golden boot is done. Tagged, since
  // the Status card's conditions list carries a `Ready` condition too.
  await expect(
    page.getByTestId('agent-readiness').getByText('Ready', { exact: true }),
    'the agent becomes ready on the platform Harness (golden boot) — a Pending that never ends means the lab Harness is not compiling it: `kubectl -n kagent get agents,harness,workerpools` and the kagent-controller log',
  ).toBeVisible({ timeout: 6 * 60_000 });

  // --- Start a session from the agent's page and get an answer -----------
  // The button follows the roster's own read of the agent (`readiness`),
  // polled apart from the header's conditions above, so it can trail
  // the header's Ready by more than an action timeout.
  const startSession = startSessionButton(page);
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
  // The start is agent-manager's start_session, called through muster.
  if (whileStarting) {
    await page.route('**/api/muster/call**', async route => {
      const call = route.request().postDataJSON() as { name?: string } | null;
      if (call?.name !== 'x_agent-manager_start_session') {
        await route.fallback();
        return;
      }
      reached();
      await held;
      await route.fallback();
    });
  }
  // Exact: the dialog's own Start, not a longer button name.
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
    new RegExp(`/sessions/${lab.installation}/[^/]+$`),
    { timeout: 60_000 },
  );
}

/**
 * Deletes the session on screen through its actions menu — the portal's own
 * path — and resolves on the Sessions list the deletion lands on.
 */
export async function deleteCurrentSession(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Session actions' }).click();
  await page.getByRole('menuitem', { name: /Delete session/ }).click();
  const dialog = page.getByRole('dialog', { name: /Delete session/ });
  await expect(dialog).toBeVisible();
  // Right after a turn kagent refuses the delete until the runtime's cleanup
  // settles ("not yet settled: precondition failed", shown in the dialog);
  // a person tries again a little later, and so does this.
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
  await expect(page).toHaveURL(/\/sessions$/, { timeout: 60_000 });
}

/**
 * The page does not scroll sideways: nothing reaches past the viewport's right
 * edge (the phone promise, T22). On a failure the message names the widest
 * offenders — the outermost elements past the edge, by tag, class and text —
 * so the cause is in the report, not only in a screenshot.
 */
export async function expectNoHorizontalScroll(
  page: Page,
  what: string,
): Promise<void> {
  const report = await page.evaluate(() => {
    const root = document.scrollingElement ?? document.documentElement;
    // The layout width, not `innerWidth`: with mobile emulation the latter
    // grows with whatever overflows it.
    const width = root.clientWidth;
    const overflowing = root.scrollWidth > root.clientWidth + 1;
    if (!overflowing) {
      return null;
    }
    const describe = (el: Element) => {
      const cls =
        typeof el.className === 'string'
          ? el.className.split(/\s+/).filter(Boolean).slice(0, 3).join('.')
          : '';
      const text = (el.textContent ?? '').trim().slice(0, 40);
      const right = Math.round(el.getBoundingClientRect().right);
      return `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ''} (right ${right}px) "${text}"`;
    };
    // Outermost offenders: an element past the edge whose parent is not —
    // `html` and `body` included, which a wide child can stretch.
    const past = (el: Element) => {
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.right > width + 1;
    };
    const all = [
      document.documentElement,
      ...Array.from(document.querySelectorAll('body, body *')),
    ];
    let offenders = all
      .filter(el => past(el) && !(el.parentElement && past(el.parentElement)))
      .slice(0, 5)
      .map(describe);
    if (offenders.length === 0) {
      // Nothing is past the edge by its box: name the widest boxes instead.
      offenders = all
        .filter(
          el =>
            el.scrollWidth > el.clientWidth + 1 &&
            getComputedStyle(el).overflowX === 'visible',
        )
        .slice(0, 5)
        .map(el => `${describe(el)} scrollWidth ${el.scrollWidth}`);
    }
    return `scrollWidth ${root.scrollWidth} > clientWidth ${root.clientWidth}; past the edge: ${offenders.join('; ') || '(none found)'}`;
  });
  expect(report, `${what}: no horizontal page scroll`).toBeNull();
}

/**
 * On a phone, `locator` is fully above the shell's bottom bar (its height is
 * `--agent-shell-mobile-bar-height` on the body) and is what a tap at its
 * centre hits — not the bar, not an overlay above it.
 */
export async function expectClearOfBottomBar(
  page: Page,
  locator: Locator,
  what: string,
): Promise<void> {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  expect(box, `${what} is laid out`).not.toBeNull();
  const barBox = await page.locator('.agent-shell-mobile-bar').boundingBox();
  const barTop = barBox ? barBox.y : page.viewportSize()!.height;
  const hit = await locator.evaluate(el => {
    const rect = el.getBoundingClientRect();
    const at = document.elementFromPoint(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
    );
    return !!at && (at === el || el.contains(at));
  });
  expect(
    box!.y + box!.height,
    `${what} ends above the bottom bar`,
  ).toBeLessThanOrEqual(barTop + 0.5);
  expect(hit, `a tap on ${what} reaches it`).toBe(true);
}

/**
 * Whether the deployment's `app.extensions` switches `extension` off, read from
 * the public config the page was served with (`script[type="backstage.io/config"]`,
 * the highest-priority layer that lists `app.extensions` wins — Backstage
 * replaces config arrays rather than merging them). For assertions on chrome
 * that follows the deployment's config, such as the classic sidebar's AI
 * Assistant, which the agent-platform chart's app-config turns off.
 */
export async function extensionDisabled(
  page: Page,
  extension: string,
): Promise<boolean> {
  return page.evaluate(id => {
    const script = document.querySelector('script[type="backstage.io/config"]');
    const layers = JSON.parse(script?.textContent ?? '[]') as {
      data?: { app?: { extensions?: unknown[] } };
    }[];
    const lists = layers
      .map(layer => layer.data?.app?.extensions)
      .filter((list): list is unknown[] => Array.isArray(list));
    const list = lists[lists.length - 1] ?? [];
    return list.some(
      entry =>
        typeof entry === 'object' &&
        entry !== null &&
        (entry as Record<string, unknown>)[id] === false,
    );
  }, extension);
}
