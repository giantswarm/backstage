import type { BrowserContext, Page, Response } from '@playwright/test';
import { completeDexLogin, expect, signIn, test as base } from './fixtures';
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
 *   repositories on the lab's GitHub (`agentlab-org`): `platform-api` by
 *   name and `monorepo` by its language (Go) and topic (`monorepo`). It is
 *   handed to the test once its first sync succeeded with both repositories
 *   in the manifest, and deleted when the worker ends.
 * - {@link WorkspaceFixtures.refusalWorkspace}: a workspace whose last sync
 *   holds the private `agentlab-org/platform-infra`, which the developer, a
 *   member of the Organization, cannot read: once the developer is connected
 *   to the provider, their Session start is refused naming it.
 * - The non-member is the lab's viewer ({@link NON_MEMBER}): the `viewers`
 *   group is outside the lab's Organization.
 *
 * What they create is named `e2e-ws-<run>-…`; before creating anything, a
 * worker removes what an earlier run left (any other run id), so a rerun after
 * an aborted run starts clean. A lab without the workspace-manager, or
 * without the provider instance the sources name, skips every spec that asks
 * for a workspace, with the reason.
 */

export const WORKSPACE_MANAGER = 'workspace-manager';
const TOOL_PREFIX = `x_${WORKSPACE_MANAGER}_`;
const MUSTER_AUTH_HEADER = 'backstage-muster-authorization';

/** The prefix of every workspace the fixtures create. */
export const WORKSPACE_PREFIX = 'e2e-ws-';
const RUN = (process.env.AGENTLAB_E2E_RUN ?? 'local').toLowerCase();

/** The person outside the lab's Organization: the `viewers` group. */
export const NON_MEMBER = lab.users.viewer;

/** The lab GitHub's owner the sources select from (`agentlab github-fake`). */
const OWNER = 'agentlab-org';

/** The public workspace's selection and the manifest its first sync must hold. */
const PUBLIC_SOURCE = {
  provider: lab.workspaces.provider,
  owner: OWNER,
  repositories: ['platform-api'],
  filters: { languages: ['Go'], topics: { names: ['monorepo'] } },
};
const PUBLIC_REPOSITORIES = [`${OWNER}/platform-api`, `${OWNER}/monorepo`];

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

  /** The manager's membership refusal (its Organization check). */
  get notMember(): boolean {
    return /is not a member of Organization|: permission denied: /.test(
      this.message,
    );
  }

  get notFound(): boolean {
    return /: not found: /.test(this.message);
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

  /** Signs the page in as {@link user}, reading the tokens on the way. */
  async signIn(): Promise<void> {
    this.tokens = await capturePortalTokens(this.page, () =>
      signIn(this.page, this.user),
    );
  }

  private async post(path: string, data: unknown) {
    if (!this.tokens) {
      await this.refreshTokens();
    }
    const send = () =>
      this.page.request.post(
        `/api/muster${path}?installation=${encodeURIComponent(lab.installation)}`,
        {
          headers: {
            Authorization: `Bearer ${this.tokens!.backstage}`,
            [MUSTER_AUTH_HEADER]: this.tokens!.muster,
          },
          data,
          timeout: 60_000,
        },
      );
    let response = await send();
    if (response.status() === 401) {
      // A token expired mid-run: read fresh ones from the next page load.
      await this.refreshTokens();
      response = await send();
    }
    return response;
  }

  /** Lists the MCP servers the person's muster aggregates. */
  async listServers(): Promise<{ name: string; state?: string }[]> {
    if (!this.tokens) {
      await this.refreshTokens();
    }
    const response = await this.page.request.get(
      `/api/muster/servers?installation=${encodeURIComponent(lab.installation)}`,
      {
        headers: {
          Authorization: `Bearer ${this.tokens!.backstage}`,
          [MUSTER_AUTH_HEADER]: this.tokens!.muster,
        },
      },
    );
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
    const response = await this.post('/call', {
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

/** Whether a workspace name is the fixtures' and not of this run. */
export function isLeftover(name: string, run: string = RUN): boolean {
  return (
    name.startsWith(WORKSPACE_PREFIX) &&
    !name.startsWith(`${WORKSPACE_PREFIX}${run}-`)
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
 * each with a head commit. A failed cycle fails at once with the manager's
 * message. From the create on, the workspace exists: the caller deletes it,
 * whatever happens next.
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

  let detail: WorkspaceDetail | undefined;
  await expect
    .poll(
      async () => {
        detail = await tools.getWorkspace(name);
        const last = detail.workspace.lastSync;
        if (last?.result === 'Failed') {
          throw new Error(
            `the first sync of ${name} failed: ${last.message ?? '(no message)'}`,
          );
        }
        return last?.result === 'Succeeded'
          ? detail.mirrors
              .filter(mirror => mirror.head)
              .map(mirror => mirror.repository)
              .sort()
          : [];
      },
      {
        timeout: FIRST_SYNC_TIMEOUT,
        intervals: [2_000],
        message: `the first sync of ${name} succeeds with ${expected.join(', ')} in its manifest — the sync Job's log: \`kubectl -n kagent get jobs\``,
      },
    )
    .toEqual([...expected].sort());

  const syncedAt = Date.parse(detail!.workspace.lastSync!.time);
  return {
    name,
    organization: lab.workspaces.organization,
    repositories: [...expected].sort(),
    firstSyncSeconds: Math.max(0, Math.round((syncedAt - createdAt) / 1000)),
  };
}

/**
 * Deletes a workspace and waits until the manager no longer lists it; one
 * already gone is fine.
 */
export async function deleteWorkspace(
  tools: WorkspaceTools,
  name: string,
): Promise<void> {
  try {
    await tools.call('delete_workspace', { workspace: name });
  } catch (error) {
    if (!(error instanceof WorkspaceToolError && error.notFound)) {
      throw error;
    }
  }
  await expect
    .poll(
      async () =>
        (await tools.listWorkspaces(lab.workspaces.organization)).some(
          workspace => workspace.name === name,
        ),
      {
        timeout: DELETION_TIMEOUT,
        intervals: [2_000],
        message: `workspace ${name} is gone after its deletion`,
      },
    )
    .toBe(false);
}

/** Deletes every workspace an earlier run of the suite left behind. */
export async function removeLeftovers(
  tools: WorkspaceTools,
): Promise<string[]> {
  const leftovers = (await tools.listWorkspaces(lab.workspaces.organization))
    .map(workspace => workspace.name)
    .filter(name => isLeftover(name));
  for (const name of leftovers) {
    await deleteWorkspace(tools, name);
  }
  return leftovers;
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
async function connectToLabGitHub(tools: WorkspaceTools): Promise<void> {
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
    await completeDexLogin(page, tools.user);
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
  workspace(): Promise<SyncedWorkspace>;
  refusal(): Promise<RefusalWorkspace>;
}

/** The refusal fixture: whom the start refuses, on which workspace, naming what. */
export type RefusalWorkspace = SyncedWorkspace & {
  /** A member of the Organization who cannot read {@link unreadable}. */
  refused: LabUser;
  unreadable: string[];
};

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

      let unavailable: string | undefined;
      let refusalUnavailable: string | undefined;
      const servers = await admin.listServers();
      if (!servers.some(server => server.name === WORKSPACE_MANAGER)) {
        unavailable = `the lab's muster serves no ${WORKSPACE_MANAGER} (platform.workspaces off): \`agentlab configure --workspaces\`, then \`agentlab platform\``;
      } else {
        const providers = await admin.listProviders();
        if (!providers.some(p => p.name === lab.workspaces.provider)) {
          unavailable = `the lab's ${WORKSPACE_MANAGER} has no provider instance "${lab.workspaces.provider}" (it lists ${providers.map(p => p.name).join(', ') || 'none'}): \`agentlab configure --workspaces-provider fake\` (or fake,github), or AGENTLAB_WORKSPACE_PROVIDER`;
        } else if (!lab.workspaces.githubFakeURL) {
          refusalUnavailable = `the refusal needs a person connected to the lab's GitHub, which this host reaches only on its loopback port: set AGENTLAB_GITHUB_FAKE_URL to it (\`docker port <cluster>-lab-github\`, https)`;
        }
      }

      const created = new Set<string>();
      const connected: WorkspaceTools[] = [];
      const once = <T>(make: () => Promise<T>) => {
        let result: Promise<T> | undefined;
        return () => (result ??= make());
      };
      // Before anything is created: what an aborted run left goes first.
      const cleaned = once(() => removeLeftovers(admin));
      const create = async (
        kind: string,
        sources: Record<string, unknown>[],
        expected: string[],
      ) => {
        await cleaned();
        const name = workspaceName(kind, workerInfo.workerIndex);
        created.add(name);
        return createSyncedWorkspace(admin, name, sources, expected);
      };

      await use({
        unavailable,
        refusalUnavailable: unavailable ?? refusalUnavailable,
        tools,
        workspace: once(() =>
          create('public', [PUBLIC_SOURCE], PUBLIC_REPOSITORIES),
        ),
        refusal: once(async () => {
          const synced = await create(
            'refusal',
            [REFUSAL_SOURCE],
            [`${OWNER}/platform-api`, PRIVATE_REPOSITORY],
          );
          const refused = await tools(lab.users.dev);
          connected.push(refused);
          await connectToLabGitHub(refused);
          return {
            ...synced,
            refused: lab.users.dev,
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
      for (const name of created) {
        await deleteWorkspace(admin, name).catch(error => failures.push(error));
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
