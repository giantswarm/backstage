import type {
  APIResponse,
  BrowserContext,
  Page,
  Response,
} from '@playwright/test';
import { expect, signIn, test as base } from './fixtures';
import { contextOptionsFor, lab, type LabUser } from './lab';

/**
 * Workspaces in a known state on the lab, for the workspace specs.
 *
 * Everything goes through the workspace-manager's own tools, as a person: the
 * portal's muster route (`POST /api/muster/call`) with the tokens the
 * person's signed-in page holds, so the manager sees the forwarded identity
 * and checks its groups against the Organization exactly as it does for the
 * portal's pages. Nothing is written to the cluster directly.
 *
 * - {@link WorkspaceFixtures.labWorkspace}: a workspace of the lab's
 *   Organization, created as the admin, with one source of public
 *   repositories on the lab's GitHub ({@link PUBLIC_SOURCE}): `platform-api`
 *   by name and `monorepo` by its language (Go) and topic (`monorepo`). It is
 *   handed to the test once its first sync succeeded with both repositories
 *   in the manifest, and deleted when the worker ends.
 * - {@link WorkspaceFixtures.refusalWorkspace}: a workspace whose last sync
 *   holds the private `agentlab-org/platform-infra`, which the developer, a
 *   member of the Organization, cannot read. The developer and the admin are
 *   connected to the provider: the developer's Session start is refused
 *   naming it, the admin's is granted.
 * - The non-member is the lab's viewer ({@link NON_MEMBER}): the `viewers`
 *   group is outside the lab's Organization.
 *
 * What they create is named `e2e-ws-<run>-…`, the run id being the run's start
 * in base 36 ({@link RUN}). Before every creation the fixtures remove what an
 * earlier run left: a fixture workspace of another run that started more than
 * {@link LEFTOVER_AGE} ago, so a rerun after an aborted run starts clean while
 * a run going on at the same time against the same lab keeps its own. A lab
 * without the workspace-manager, with one that does not answer, or without
 * the provider instance the sources name, skips every spec that asks for a
 * workspace, with the reason.
 */

export const WORKSPACE_MANAGER = 'workspace-manager';
const TOOL_PREFIX = `x_${WORKSPACE_MANAGER}_`;
const MUSTER_AUTH_HEADER = 'backstage-muster-authorization';

/** The prefix of every workspace the fixtures create. */
export const WORKSPACE_PREFIX = 'e2e-ws-';

/**
 * This run's id: `AGENTLAB_E2E_RUN`, which `playwright.config.ts` sets to the
 * run's start (`Date.now()` in base 36) unless it is given. A workspace name
 * takes lower-case letters, digits and '-', so a given id must be letters and
 * digits only.
 */
export const RUN = (() => {
  const run = (process.env.AGENTLAB_E2E_RUN ?? 'local').toLowerCase();
  if (!/^[a-z0-9]+$/.test(run)) {
    throw new Error(
      `AGENTLAB_E2E_RUN must be letters and digits only (it names workspaces), not "${run}"`,
    );
  }
  return run;
})();

/**
 * A fixture workspace of another run is left over once that run started this
 * long ago: no run of the suite takes so long, so a run going on at the same
 * time keeps what it uses.
 */
export const LEFTOVER_AGE = 3 * 60 * 60_000;

/** The person outside the lab's Organization: the `viewers` group. */
export const NON_MEMBER = lab.users.viewer;

/** The lab GitHub's owner the sources select from (`agentlab github-fake`). */
export const OWNER = 'agentlab-org';

/** The public workspace's selection. */
export const PUBLIC_SOURCE = {
  provider: lab.workspaces.provider,
  owner: OWNER,
  repositories: ['platform-api'],
  filters: { languages: ['Go'], topics: { names: ['monorepo'] } },
};
/** The manifest the public selection's first sync holds. */
export const PUBLIC_REPOSITORIES = [
  `${OWNER}/monorepo`,
  `${OWNER}/platform-api`,
];

/** The private repository only the admin and the App's installation read. */
const PRIVATE_REPOSITORY = `${OWNER}/platform-infra`;
const REFUSAL_SOURCE = {
  provider: lab.workspaces.provider,
  owner: OWNER,
  repositories: ['platform-api', 'platform-infra'],
};

const FIRST_SYNC_TIMEOUT = 5 * 60_000;
const DELETION_TIMEOUT = 3 * 60_000;

// --- The manager's answers, as far as the fixtures read them --------------

export type LastSync = {
  time: string;
  result: 'Succeeded' | 'Failed' | 'NoChange';
  message?: string;
};

export type Workspace = {
  name: string;
  organization: string;
  createdAt: string;
  deleting?: boolean;
  lastSync?: LastSync;
  repositories: number;
};

export type WorkspaceMirror = { repository: string; head?: string };

export type WorkspaceDetail = {
  workspace: Workspace;
  mirrors: WorkspaceMirror[];
};

export type WorkspaceAuthorization = {
  workspace: string;
  outcome: 'granted' | 'refused' | 'connect_required';
  reason?: string;
  unreadable?: string[];
  connect?: { provider: string; url: string }[];
};

type Provider = { name: string; kind: string; connected: boolean };

/** A workspace-manager tool the portal's muster route refused or failed. */
export class WorkspaceToolError extends Error {
  readonly name = 'WorkspaceToolError';
  constructor(
    readonly tool: string,
    readonly status: number,
    message: string,
  ) {
    super(`${tool}: ${message}`);
  }

  /**
   * The manager's own membership refusal: its Organization check answers
   * `<operation>: permission denied: forbidden: <person> is not a member of
   * Organization "<name>"`. A refusal by muster or the portal before the
   * manager runs is not this.
   */
  get notMember(): boolean {
    return /is not a member of Organization|: permission denied: /.test(
      this.message,
    );
  }

  /** The workspace does not exist (the manager's `not found`, any wording). */
  get notFound(): boolean {
    return /not found/i.test(this.message);
  }
}

type Tokens = { backstage: string; muster: string };

/**
 * The portal's tokens for the person signed in on `page`, read from the
 * app's own silent sign-in while `navigate` runs: the refresh answer of the
 * sign-in provider carries the Backstage identity token and the provider's
 * ID token, which the muster plugin sends to the home muster
 * (`backstage-muster-authorization`). No extra refresh is made: Dex rotates
 * the refresh token on every one, and the page's own stays the only one.
 */
async function capturePortalTokens(
  page: Page,
  navigate: () => Promise<void>,
): Promise<Tokens> {
  let found: Tokens | undefined;
  const reads: Promise<void>[] = [];
  const onResponse = (response: Response) => {
    if (!/\/api\/auth\/[^/]+\/refresh/.test(response.url()) || !response.ok()) {
      return;
    }
    reads.push(
      response
        .json()
        .then(body => {
          const backstage = body?.backstageIdentity?.token;
          const muster = body?.providerInfo?.idToken;
          if (!found && typeof backstage === 'string' && muster) {
            found = { backstage, muster };
          }
        })
        .catch(() => undefined),
    );
  };
  page.on('response', onResponse);
  try {
    await navigate();
    await expect
      .poll(
        async () => {
          await Promise.all(reads);
          return found !== undefined;
        },
        {
          timeout: 30_000,
          message:
            "the app's sign-in refresh named no Backstage identity and ID token",
        },
      )
      .toBe(true);
  } finally {
    page.off('response', onResponse);
  }
  return found!;
}

/**
 * workspace-manager's tools as one person: the portal's muster route with the
 * tokens of the person's signed-in page.
 */
export class WorkspaceTools {
  private tokens?: Tokens;

  constructor(
    readonly page: Page,
    readonly user: LabUser,
  ) {}

  /** Reads the tokens from a page load (the page is left on `/`). */
  async refreshTokens(): Promise<void> {
    this.tokens = await capturePortalTokens(this.page, async () => {
      await this.page.goto('/');
    });
  }

  /**
   * Signs the page in as {@link user}, then reads the tokens from the next
   * page load: the sign-in popup hands its result to the page by message,
   * not through a refresh the page could read.
   */
  async signIn(): Promise<void> {
    await signIn(this.page, this.user);
    await this.refreshTokens();
  }

  /**
   * One request to the portal's muster routes as the person, against the
   * lab's installation; a 401 (a token expired mid-run) is retried once with
   * fresh tokens.
   */
  private async request(
    method: 'GET' | 'POST',
    path: string,
    data?: unknown,
  ): Promise<APIResponse> {
    const send = async () => {
      if (!this.tokens) {
        await this.refreshTokens();
      }
      return this.page.request.fetch(
        `/api/muster${path}?installation=${encodeURIComponent(lab.installation)}`,
        {
          method,
          headers: {
            Authorization: `Bearer ${this.tokens!.backstage}`,
            [MUSTER_AUTH_HEADER]: this.tokens!.muster,
          },
          data,
          timeout: 60_000,
        },
      );
    };
    const response = await send();
    if (response.status() !== 401) {
      return response;
    }
    this.tokens = undefined;
    return send();
  }

  /** The MCP servers the person's muster aggregates, with their state. */
  async listServers(): Promise<{ name: string; state?: string }[]> {
    const response = await this.request('GET', '/servers');
    expect(
      response.ok(),
      `the portal lists muster's servers for ${this.user.email} (${response.status()})`,
    ).toBe(true);
    const body = await response.json();
    return body?.mcpServers ?? [];
  }

  /**
   * Calls one tool by its workspace-manager name and returns its structured
   * answer; a refusal throws {@link WorkspaceToolError} with the manager's
   * words.
   */
  async call<T>(tool: string, args: Record<string, unknown> = {}): Promise<T> {
    const response = await this.request('POST', '/call', {
      name: `${TOOL_PREFIX}${tool}`,
      arguments: args,
    });
    const body = await response.json().catch(() => undefined);
    if (!response.ok()) {
      throw new WorkspaceToolError(
        tool,
        response.status(),
        body?.error?.message ?? `HTTP ${response.status()}`,
      );
    }
    if (typeof body === 'string') {
      // The route answered the tool's text: workspace-manager's text is a
      // sentence, its data the structured content.
      throw new WorkspaceToolError(
        tool,
        response.status(),
        `the portal's muster route answered the tool's text, not its structured content: "${body}". The lab's Backstage must answer a tool's structuredContent where its text is prose`,
      );
    }
    return body as T;
  }

  async listWorkspaces(organization?: string): Promise<Workspace[]> {
    const result = await this.call<{ workspaces?: Workspace[] }>(
      'list_workspaces',
      organization ? { organization } : {},
    );
    return result.workspaces ?? [];
  }

  getWorkspace(workspace: string): Promise<WorkspaceDetail> {
    return this.call<WorkspaceDetail>('get_workspace', { workspace });
  }

  async listProviders(): Promise<Provider[]> {
    const result = await this.call<{ providers?: Provider[] }>(
      'list_providers',
    );
    return result.providers ?? [];
  }

  authorizeWorkspace(workspace: string): Promise<WorkspaceAuthorization> {
    return this.call<WorkspaceAuthorization>('authorize_workspace', {
      workspace,
    });
  }
}

/**
 * When the run that created a fixture workspace started: from its run id
 * (base 36 milliseconds) where that reads as a time, else the workspace's own
 * creation.
 */
function runStart(workspace: Workspace): number {
  const run = workspace.name.slice(WORKSPACE_PREFIX.length).split('-')[0];
  const started = parseInt(run, 36);
  // A start between 2020 and an hour from now is a run id of the config's.
  return started > Date.UTC(2020, 0) && started < Date.now() + 60 * 60_000
    ? started
    : Date.parse(workspace.createdAt);
}

/**
 * Whether a workspace is a fixture workspace an earlier run left: another run
 * id, and that run started more than {@link LEFTOVER_AGE} ago.
 */
export function isLeftover(
  workspace: Workspace,
  now: number = Date.now(),
): boolean {
  return (
    workspace.name.startsWith(WORKSPACE_PREFIX) &&
    !workspace.name.startsWith(`${WORKSPACE_PREFIX}${RUN}-`) &&
    now - runStart(workspace) > LEFTOVER_AGE
  );
}

/** A name of this run for the worker's workspace of `kind`. */
export function workspaceName(kind: string, workerIndex: number): string {
  return `${WORKSPACE_PREFIX}${RUN}-${workerIndex}-${kind}`;
}

/** A workspace the fixtures created and saw synced. */
export type SyncedWorkspace = {
  name: string;
  organization: string;
  /** `<owner>/<name>` of every repository the first sync mirrored. */
  repositories: string[];
  /** From the creation to the first successful sync's end, in seconds. */
  firstSyncSeconds: number;
};

/**
 * Creates a workspace of the lab's Organization as `tools`' person and waits
 * until its first sync succeeded with exactly `expected` in its manifest,
 * each with a head commit. A failed first cycle fails at once with the
 * manager's message. From the create on, the workspace exists: the caller
 * deletes it, whatever happens next.
 */
export async function createSyncedWorkspace(
  tools: WorkspaceTools,
  name: string,
  sources: Record<string, unknown>[],
  expected: string[],
): Promise<SyncedWorkspace> {
  const created = await tools.call<Workspace>('create_workspace', {
    name,
    organization: lab.workspaces.organization,
    sources,
  });
  expect(created.name).toBe(name);
  const createdAt = Date.parse(created.createdAt);
  const want = [...expected].sort();

  // A loop of its own rather than expect.poll, which would swallow a failed
  // first sync and keep polling until a later cycle passes.
  const deadline = Date.now() + FIRST_SYNC_TIMEOUT;
  let mirrored: string[] = [];
  for (;;) {
    const detail = await tools.getWorkspace(name);
    const last = detail.workspace.lastSync;
    if (last?.result === 'Failed') {
      throw new Error(
        `the first sync of ${name} failed: ${last.message ?? '(no message)'}`,
      );
    }
    mirrored = detail.mirrors
      .filter(mirror => mirror.head)
      .map(mirror => mirror.repository)
      .sort();
    if (last?.result === 'Succeeded') {
      expect(
        mirrored,
        `the first sync of ${name} mirrored exactly the selection, each with its head`,
      ).toEqual(want);
      return {
        name,
        organization: lab.workspaces.organization,
        repositories: want,
        firstSyncSeconds: Math.max(
          0,
          Math.round((Date.parse(last.time) - createdAt) / 1000),
        ),
      };
    }
    if (Date.now() > deadline) {
      throw new Error(
        `the first sync of ${name} did not succeed within ${FIRST_SYNC_TIMEOUT / 1000} s (last: ${last?.result ?? 'none'}, mirrored: ${mirrored.join(', ') || 'none'}): the sync Job's log, \`kubectl -n kagent get jobs\``,
      );
    }
    await new Promise(resolve => setTimeout(resolve, 2_000));
  }
}

/**
 * Deletes workspaces and waits until the manager lists none of them: every
 * deletion is requested first, then one wait covers them all. One already
 * gone is fine. Resolves with the names still listed at the deadline.
 */
export async function deleteWorkspaces(
  tools: WorkspaceTools,
  names: string[],
  timeout: number = DELETION_TIMEOUT,
): Promise<string[]> {
  for (const name of names) {
    try {
      await tools.call('delete_workspace', { workspace: name });
    } catch (error) {
      if (!(error instanceof WorkspaceToolError && error.notFound)) {
        throw error;
      }
    }
  }
  const deadline = Date.now() + timeout;
  for (;;) {
    const listed = new Set(
      (await tools.listWorkspaces(lab.workspaces.organization)).map(
        workspace => workspace.name,
      ),
    );
    const remaining = names.filter(name => listed.has(name));
    if (remaining.length === 0 || Date.now() > deadline) {
      return remaining;
    }
    await new Promise(resolve => setTimeout(resolve, 2_000));
  }
}

/** Deletes a workspace and fails unless the manager stops listing it. */
export async function deleteWorkspace(
  tools: WorkspaceTools,
  name: string,
): Promise<void> {
  const remaining = await deleteWorkspaces(tools, [name]);
  expect(remaining, `workspace ${name} is gone after its deletion`).toEqual([]);
}

/** What a sweep for leftovers removed, and what it could not. */
export type Sweep = { removed: string[]; stuck: string[] };

/**
 * Deletes every fixture workspace an earlier run left ({@link isLeftover}).
 * One that does not go within the deletion wait is reported, not thrown: it
 * belongs to no run going on, so it does not fail this one.
 */
export async function removeLeftovers(tools: WorkspaceTools): Promise<Sweep> {
  const leftovers = (await tools.listWorkspaces(lab.workspaces.organization))
    .filter(workspace => isLeftover(workspace))
    .map(workspace => workspace.name);
  const stuck = await deleteWorkspaces(tools, leftovers);
  if (stuck.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(
      `workspace fixtures: leftovers still listed after their deletion: ${stuck.join(', ')}`,
    );
  }
  return { removed: leftovers.filter(name => !stuck.includes(name)), stuck };
}

/**
 * Connects `tools`' person to the lab's GitHub (`fake`) the way a person
 * does: `connect_provider`'s link, the provider's consent, the manager's
 * callback in the person's browser (signing in to the manager through Dex
 * first). The lab's GitHub consents at once for the user its `login`
 * parameter names; the browser cannot reach it by its lab name, so the
 * consent is fetched from {@link lab.workspaces.githubFakeURL} and the
 * browser follows its redirect to the callback.
 */
export async function connectToLabGitHub(tools: WorkspaceTools): Promise<void> {
  const { authorizationURL } = await tools.call<{ authorizationURL: string }>(
    'connect_provider',
    { provider: lab.workspaces.provider },
  );
  const consent = new URL(authorizationURL);
  const local = new URL(lab.workspaces.githubFakeURL!);
  consent.protocol = local.protocol;
  consent.host = local.host;
  consent.searchParams.set('login', tools.user.email.split('@')[0]);
  const answer = await tools.page.request.get(consent.toString(), {
    maxRedirects: 0,
  });
  const callback = answer.headers().location;
  expect(
    callback,
    `the lab's GitHub consents for ${tools.user.email} (${answer.status()} ${await answer.text().catch(() => '')})`,
  ).toBeTruthy();

  const page = tools.page;
  await page.goto(callback!);
  if (new URL(page.url()).pathname.includes('/dex/')) {
    // The manager's own sign-in, in this tab (not a popup to close).
    await page.locator('input[name="login"]').fill(tools.user.email);
    await page.locator('input[name="password"]').fill(lab.password);
    await page.getByRole('button', { name: 'Login' }).click();
  }
  await expect(
    page.getByText(`${lab.workspaces.provider} connected`).first(),
    `the manager's callback connects ${tools.user.email} to ${lab.workspaces.provider}`,
  ).toBeVisible({ timeout: 60_000 });
}

/** The worker's workspaces; each created on first use, removed at the end. */
export interface WorkspaceLab {
  /** Why the specs skip, or undefined when the lab serves what they need. */
  unavailable?: string;
  /** Why the refusal specs skip, or undefined when the lab can refuse. */
  refusalUnavailable?: string;
  /** workspace-manager's tools as a lab user, on a page of their own. */
  tools(user: LabUser): Promise<WorkspaceTools>;
  /**
   * The fixtures' own creation, for a spec that needs a workspace of its
   * own: leftovers of earlier runs removed first, then a workspace of this
   * run named for `kind`, synced; the worker deletes it at the end unless the
   * spec did. `sweep` reports what the removal found.
   */
  create(
    kind: string,
    sources: Record<string, unknown>[],
    expected: string[],
  ): Promise<SyncedWorkspace & { sweep: Sweep }>;
  workspace(): Promise<SyncedWorkspace>;
  refusal(): Promise<RefusalWorkspace>;
}

/** The refusal fixture: whom the start refuses, on which workspace, naming what. */
export type RefusalWorkspace = SyncedWorkspace & {
  /** A member of the Organization who cannot read {@link unreadable}. */
  refused: LabUser;
  /** A member who reads every repository of it, connected too. */
  granted: LabUser;
  unreadable: string[];
};

/**
 * Whether the lab serves what the specs need, and why not: the
 * workspace-manager listed and connected in the admin's muster, answering
 * `list_providers` with structured content, with the provider instance the
 * sources name.
 */
async function availability(
  admin: WorkspaceTools,
): Promise<{ unavailable?: string; refusalUnavailable?: string }> {
  const server = (await admin.listServers()).find(
    s => s.name === WORKSPACE_MANAGER,
  );
  if (!server) {
    return {
      unavailable: `the lab's muster serves no ${WORKSPACE_MANAGER} (platform.workspaces off): \`agentlab configure --workspaces\`, then \`agentlab platform\``,
    };
  }
  if (server.state && !/^(connected|running)$/i.test(server.state)) {
    return {
      unavailable: `the lab's muster lists ${WORKSPACE_MANAGER} as ${server.state}, not connected: \`kubectl -n agent-platform get pods\``,
    };
  }
  let providers: Provider[];
  try {
    providers = await admin.listProviders();
  } catch (error) {
    return {
      unavailable: `the lab's ${WORKSPACE_MANAGER} does not answer list_providers: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  if (!providers.some(p => p.name === lab.workspaces.provider)) {
    return {
      unavailable: `the lab's ${WORKSPACE_MANAGER} has no provider instance "${lab.workspaces.provider}" (it lists ${providers.map(p => p.name).join(', ') || 'none'}): \`agentlab configure --workspaces-provider fake\` (or fake,github), or AGENTLAB_WORKSPACE_PROVIDER`,
    };
  }
  if (!lab.workspaces.githubFakeURL) {
    return {
      refusalUnavailable: `the refusal needs people connected to the lab's GitHub, which this host reaches only on its loopback port: set AGENTLAB_GITHUB_FAKE_URL to it (see e2e/agentlab/README.md)`,
    };
  }
  return {};
}

type WorkerFixtures = { workspaceLab: WorkspaceLab };

export type WorkspaceFixtures = {
  /** The worker's public workspace, synced; skips on a lab without one. */
  labWorkspace: SyncedWorkspace;
  /** The worker's refusal workspace; skips where the lab cannot refuse. */
  refusalWorkspace: RefusalWorkspace;
};

export const test = base.extend<WorkspaceFixtures, WorkerFixtures>({
  workspaceLab: [
    async ({ adminPage, browser, variant }, use, workerInfo) => {
      const contexts: BrowserContext[] = [];
      const people = new Map<string, Promise<WorkspaceTools>>();
      const tools = (user: LabUser) => {
        let entry = people.get(user.email);
        if (!entry) {
          entry =
            user.email === lab.users.admin.email
              ? Promise.resolve(new WorkspaceTools(adminPage, user))
              : (async () => {
                  // One live page per person and worker: the portal's
                  // session rests on Dex's rotating refresh token.
                  const context = await browser.newContext(
                    contextOptionsFor(variant),
                  );
                  contexts.push(context);
                  const person = new WorkspaceTools(
                    await context.newPage(),
                    user,
                  );
                  await person.signIn();
                  return person;
                })();
          people.set(user.email, entry);
        }
        return entry;
      };
      const admin = await tools(lab.users.admin);
      const { unavailable, refusalUnavailable } = await availability(admin);

      const created = new Set<string>();
      const connected: WorkspaceTools[] = [];
      const once = <T>(make: () => Promise<T>) => {
        let result: Promise<T> | undefined;
        return () => (result ??= make());
      };
      const create = async (
        kind: string,
        sources: Record<string, unknown>[],
        expected: string[],
      ) => {
        const sweep = await removeLeftovers(admin);
        const name = workspaceName(kind, workerInfo.workerIndex);
        created.add(name);
        return {
          ...(await createSyncedWorkspace(admin, name, sources, expected)),
          sweep,
        };
      };

      await use({
        unavailable,
        refusalUnavailable: unavailable ?? refusalUnavailable,
        tools,
        create,
        workspace: once(() =>
          create('public', [PUBLIC_SOURCE], PUBLIC_REPOSITORIES),
        ),
        refusal: once(async () => {
          const synced = await create(
            'refusal',
            [REFUSAL_SOURCE],
            [`${OWNER}/platform-api`, PRIVATE_REPOSITORY],
          );
          for (const user of [lab.users.dev, lab.users.admin]) {
            const person = await tools(user);
            connected.push(person);
            await connectToLabGitHub(person);
          }
          return {
            ...synced,
            refused: lab.users.dev,
            granted: lab.users.admin,
            unreadable: [PRIVATE_REPOSITORY],
          };
        }),
      });

      // Everything the worker made goes, a failed test's worker included;
      // the first failure is reported once every removal was tried.
      const failures: unknown[] = [];
      for (const person of connected) {
        await person
          .call('disconnect_provider', { provider: lab.workspaces.provider })
          .catch(error => failures.push(error));
      }
      if (created.size > 0) {
        await deleteWorkspaces(admin, [...created])
          .then(stuck =>
            expect(stuck, 'the worker removes its workspaces').toEqual([]),
          )
          .catch(error => failures.push(error));
      }
      await Promise.all(contexts.map(context => context.close()));
      if (failures.length > 0) {
        throw failures[0];
      }
    },
    { scope: 'worker', timeout: 10 * 60_000 },
  ],

  // The first test that asks waits for the creation and the first sync, which
  // the fixture's own timeout covers rather than the test's.
  labWorkspace: [
    async ({ workspaceLab }, use) => {
      test.skip(!!workspaceLab.unavailable, workspaceLab.unavailable);
      await use(await workspaceLab.workspace());
    },
    { timeout: FIRST_SYNC_TIMEOUT + DELETION_TIMEOUT },
  ],

  refusalWorkspace: [
    async ({ workspaceLab }, use) => {
      test.skip(
        !!workspaceLab.refusalUnavailable,
        workspaceLab.refusalUnavailable,
      );
      await use(await workspaceLab.refusal());
    },
    { timeout: FIRST_SYNC_TIMEOUT + DELETION_TIMEOUT + 2 * 60_000 },
  ],
});

export { expect };
