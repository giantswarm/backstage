import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BrowserContext, Page } from '@playwright/test';
import {
  createAgentInWizard,
  deleteAgentInPortal,
  expect,
  expectAgentRendered,
  open,
  openWizardMoreOptions,
  rosterLinkOf,
  rosterRowOf,
  searchRoster,
  signIn,
  test as base,
} from './fixtures';
import { KUBECONFIG, kubectl, NEEDS_KUBECONFIG } from './kubectl';
import { RUN, contextOptionsFor, lab, type LabUser } from './lab';

/**
 * Agents per organization (giantswarm/giantswarm#36698 D6,
 * giantswarm/backstage#2606, #3363, #3378), the portal half of agentlab's
 * `organizations-test` (giantswarm/agentlab#1155), in a browser: what only a
 * page shows. Two organizations under the lab's parent
 * namespace:
 *
 * - the lab's own ({@link lab.organization}), whose `organization-editors`
 *   binds the developers, so the lab's developer, and where the worker's
 *   `labAgent` lives;
 * - `e2e-organization`, which this spec makes as an organization's creator does
 *   ({@link applyOrganization}): the tenant group `tenant-a` (alice) its
 *   `agent-platform:editor`, so her only organization, and the lab's
 *   developer its `agent-platform:user`.
 *
 * bob (`tenant-b`) is bound in neither. agent-manager's
 * `list_my_organizations`, the kagent controller's Kubernetes authorizer and
 * the API server's RBAC decide, each with the person's own token; the lab's
 * API server spells a subject `oidc:<name>`.
 *
 * Every test stands alone, so a red one leaves the others run: the ones on
 * the organization's agent ask for {@link OrganizationFixtures.organizationAgent},
 * which the worker sets up once, and again in the next worker after a red
 * test.
 *
 * One worker, one run per lab: a second worker's or run's teardown would
 * delete the organization under the first, and alice and bob must be bound
 * nowhere else. The fixture refuses `AGENTLAB_E2E_WORKERS` above 1; two runs
 * on one lab are not detected.
 *
 * Needs a lab with organizations (agentlab's default), alice and bob among
 * its users (`agentlab.yaml`), and `AGENTLAB_KUBECONFIG` for the organization,
 * its RoleBindings and its model.
 */

const users = {
  alice: { email: 'alice@lab.local', name: 'Lab Tenant A' },
  bob: { email: 'bob@lab.local', name: 'Lab Tenant B' },
} satisfies Record<string, LabUser>;

const organization = 'e2e-organization';
const { parent: PARENT, name: LAB_ORGANIZATION } = lab.organization;
const ORGANIZATION_RESOURCE =
  'agentplatformorganizations.agent-platform.giantswarm.io';
/** The spec's organization in the lab's parent namespace, as kubectl names it. */
const organizationRef = [
  '-n',
  PARENT,
  `${ORGANIZATION_RESOURCE}/${organization}`,
];
/** The organization as a sentence names it. */
const inSentence = `the ${organization} organization`;
/** The lab API server's `--oidc-username-prefix` and groups prefix. */
const subjectPrefix = 'oidc:';
const rosterWait = 2 * 60_000;

/** The organization's agent: named by the run (`AGENTLAB_E2E_RUN`). */
const agent = {
  name: `E2E Organization ${RUN}`,
  slug: `e2e-organization-${RUN}`,
};

/** The organization's agent's page, in the organization's namespace. */
function detailPathIn(namespace: string): string {
  return `/customize/agents/${lab.installation}/${namespace}/${agent.slug}`;
}

/** An organization's `<parent>/<name>` page. */
function organizationPath(name: string): string {
  return `/organizations/${lab.installation}/${PARENT}/${name}`;
}

type OrganizationFixtures = {
  /**
   * The organization's agent, created by alice, its editor, in the New agent
   * wizard the first time a test of the worker asks for it, in the
   * organization this spec makes and binds ({@link applyOrganization}), and
   * rendered past Deploying; its detail page's path. One the run made already
   * (an earlier worker's teardown that did not remove it) is used as it is.
   * When the worker ends, also after a red test, alice deletes it in the
   * portal where the wizard put it, and the organization goes with its
   * namespace, whatever the deletion did. A failed creation or render fails
   * the later workers of the run at once.
   */
  organizationAgent: string;
};

/** Where a worker records a failed `organizationAgent` setup for the rest of the run. */
function setupFailureFile(outputDir: string): string {
  return join(outputDir, 'organization-agent-setup-failed.txt');
}

const test = base.extend<{}, OrganizationFixtures>({
  organizationAgent: [
    async ({ browser, variant }, use, workerInfo) => {
      if (workerInfo.config.workers > 1) {
        throw new Error(
          `organizations.spec.ts runs on one worker, not ${workerInfo.config.workers}: its one organization would be deleted by one worker's teardown under another (run with AGENTLAB_E2E_WORKERS=1 and no --workers above 1)`,
        );
      }
      // A failed creation or render is the run's answer: the next worker (after
      // a red test) fails at once instead of paying the wizard and the deploy
      // again.
      const failureFile = setupFailureFile(workerInfo.project.outputDir);
      if (existsSync(failureFile)) {
        throw new Error(
          `the organization's agent could not be set up earlier in this run: ${readFileSync(failureFile, 'utf8')}`,
        );
      }
      let context: BrowserContext | undefined;
      let alice: Page | undefined;
      let namespace: string | undefined;
      let createdAt: string | undefined;
      let rendered = false;
      try {
        namespace = await applyOrganization();
        context = await browser.newContext(contextOptionsFor(variant));
        alice = await context.newPage();
        await signIn(alice, users.alice);
        try {
          if (await agentExists(namespace)) {
            createdAt = detailPathIn(namespace);
            await open(alice, createdAt, users.alice);
          } else {
            createdAt = await createAgentInWizard(
              alice,
              agent.name,
              agent.slug,
            );
            expect(
              createdAt,
              'the wizard creates in the only organization its editor belongs to',
            ).toBe(detailPathIn(namespace));
          }
          // The first agent in a new namespace waits for Flux to pull the
          // agent chart: the tests then find it rendered.
          await expectAgentRendered(alice);
          rendered = true;
        } catch (error) {
          mkdirSync(workerInfo.project.outputDir, { recursive: true });
          writeFileSync(failureFile, String(error));
          throw error;
        }
        await use(createdAt);
      } finally {
        try {
          // Where the wizard put it, a wrong organization too; without the
          // wizard's hand-off, the organization's, if Create got that far. One
          // in the organization that never rendered goes with the
          // organization: the portal's deletion would wait for the render
          // again.
          const agentPath = namespace && detailPathIn(namespace);
          const at =
            createdAt ??
            (namespace && (await agentExists(namespace))
              ? agentPath
              : undefined);
          if (alice && at && (rendered || at !== agentPath)) {
            await deleteAgentInPortal(alice, at, agent.slug);
          }
        } finally {
          await context?.close();
          await deleteOrganization();
        }
      }
    },
    // One budget for setup and teardown, and the teardown does not run once
    // it is spent: an earlier organization's erasure, the wizard and the
    // agent's first render on a cold lab (up to AGENT_RENDER_TIMEOUT), then
    // the deletion's render and roster waits and Flux's uninstall.
    { scope: 'worker', timeout: 30 * 60_000 },
  ],
});

function binding(
  namespace: string,
  name: string,
  role: string,
  subject: object,
) {
  return {
    apiVersion: 'rbac.authorization.k8s.io/v1',
    kind: 'RoleBinding',
    metadata: { name, namespace },
    roleRef: {
      apiGroup: 'rbac.authorization.k8s.io',
      kind: 'ClusterRole',
      name: role,
    },
    subjects: [{ apiGroup: 'rbac.authorization.k8s.io', ...subject }],
  };
}

/**
 * The RoleBindings outside the spec's organization that name the person or
 * their group, as `namespace/name`.
 */
async function bindingsOf(
  user: LabUser,
  group: string,
  except?: string,
): Promise<string[]> {
  const { stdout } = await kubectl(['get', 'rolebindings', '-A', '-o', 'json']);
  const names = [`${subjectPrefix}${group}`, `${subjectPrefix}${user.email}`];
  const list = JSON.parse(stdout) as {
    items: {
      metadata: { namespace: string; name: string };
      subjects?: { name: string }[];
    }[];
  };
  return list.items
    .filter(item => item.metadata.namespace !== except)
    .filter(item => item.subjects?.some(s => names.includes(s.name)))
    .map(item => `${item.metadata.namespace}/${item.metadata.name}`);
}

/**
 * Deletes the spec's organization; agent-platform-operator erases its
 * namespace with it. The chart's delete-intent admission policy refuses the
 * deletion of an organization without the prune annotation.
 */
async function deleteOrganization() {
  await kubectl([
    'annotate',
    ...organizationRef,
    'kustomize.toolkit.fluxcd.io/prune=enabled',
    '--overwrite',
  ]).catch(() => undefined);
  await kubectl([
    'delete',
    ...organizationRef,
    '--ignore-not-found',
    '--wait=false',
  ]);
}

/**
 * The spec's organization, made as its creator makes one and applied again as
 * it is: the `AgentPlatformOrganization` (the platform Harness, one worker),
 * Ready with its namespace; then there its editor (alice's group) and user
 * (the developer) and its model, the lab's default (`lab.defaultModel`) on
 * the lab's `aiModel`, marked the namespace's default. Its key is a
 * placeholder in a tenant credential (the only Secret the chart admits a
 * ModelConfig's key from): the spec runs no turn. Returns the organization's
 * namespace.
 */
async function applyOrganization(): Promise<string> {
  // A worker right after another's teardown finds the organization still
  // being erased (its snapshot step takes minutes), which takes no new
  // generation.
  const { stdout: deleting } = await kubectl([
    'get',
    ...organizationRef,
    '--ignore-not-found',
    '-o',
    'jsonpath={.metadata.deletionTimestamp}',
  ]);
  if (deleting) {
    await kubectl(['wait', '--for=delete', ...organizationRef, '--timeout=8m']);
  }
  // alice's only organization must be this one, and bob in none; the
  // organization an earlier worker of the run left binds them already.
  const { stdout: own } = await kubectl([
    'get',
    ...organizationRef,
    '--ignore-not-found',
    '-o',
    'jsonpath={.status.namespace}',
  ]);
  for (const [user, group] of [
    [users.alice, 'tenant-a'],
    [users.bob, 'tenant-b'],
  ] as const) {
    const elsewhere = await bindingsOf(user, group, own || undefined);
    if (elsewhere.length > 0) {
      throw new Error(
        `${user.email} is bound by ${elsewhere.join(', ')} already (an organization an earlier run left, still being erased, or another run's): the spec needs alice in its organization alone and bob in none`,
      );
    }
  }
  await kubectl(
    ['apply', '-f', '-'],
    JSON.stringify({
      apiVersion: 'agent-platform.giantswarm.io/v1alpha1',
      kind: 'AgentPlatformOrganization',
      metadata: { name: organization, namespace: PARENT },
      spec: { harnesses: ['kagent'], workers: { replicas: 1 } },
    }),
  );
  await kubectl([
    'wait',
    '--for=condition=Ready',
    ...organizationRef,
    '--timeout=3m',
  ]);
  const { stdout: namespace } = await kubectl([
    'get',
    ...organizationRef,
    '-o',
    'jsonpath={.status.namespace}',
  ]);
  if (!namespace) {
    throw new Error(
      `the organization ${PARENT}/${organization} is Ready without status.namespace`,
    );
  }
  const { stdout: model } = await kubectl([
    'get',
    'modelconfigs.api.kagent.dev',
    '-n',
    'kagent',
    lab.defaultModel,
    '-o',
    'jsonpath={.spec.model}',
  ]);
  const credential = 'tenant-credential-anthropic';
  const objects = [
    binding(namespace, 'organization-editors', 'agent-platform:editor', {
      kind: 'Group',
      name: `${subjectPrefix}tenant-a`,
    }),
    binding(namespace, 'organization-users', 'agent-platform:user', {
      kind: 'User',
      name: `${subjectPrefix}${lab.users.dev.email}`,
    }),
    {
      apiVersion: 'v1',
      kind: 'Secret',
      metadata: { name: credential, namespace },
      stringData: { ANTHROPIC_API_KEY: 'e2e-organization-no-turns' },
    },
    {
      apiVersion: 'api.kagent.dev/v1alpha3',
      kind: 'ModelConfig',
      metadata: {
        name: lab.defaultModel,
        namespace,
        annotations: {
          'agent-platform.giantswarm.io/default-model-config': 'true',
          'agent-platform.giantswarm.io/is-default-model-config': 'true',
        },
      },
      spec: {
        provider: 'Anthropic',
        model,
        apiKeySecret: credential,
        apiKeySecretKey: 'ANTHROPIC_API_KEY',
      },
    },
  ];
  await kubectl(
    ['apply', '-f', '-'],
    JSON.stringify({ apiVersion: 'v1', kind: 'List', items: objects }),
  );
  return namespace;
}

/** Whether the run's agent has a HelmRelease in the organization's namespace. */
async function agentExists(namespace: string): Promise<boolean> {
  const { stdout } = await kubectl([
    'get',
    'helmreleases.helm.toolkit.fluxcd.io',
    '-n',
    namespace,
    agent.slug,
    '--ignore-not-found',
    '-o',
    'name',
  ]);
  return stdout.trim() !== '';
}

/** The platform tenant's Agents, as `namespace/name`. */
async function platformAgents(): Promise<string[]> {
  const { stdout } = await kubectl([
    'get',
    'agents.api.kagent.dev',
    '-n',
    'kagent',
    '-o',
    'name',
  ]);
  return stdout.split('\n').filter(Boolean);
}

/** The agent page header's Edit. */
function editButton(page: Page) {
  return page
    .getByRole('button', { name: 'Edit', exact: true })
    .or(page.getByRole('link', { name: 'Edit', exact: true }));
}

/** The value beside a fact's term on the agent page. */
function fact(page: Page, term: string) {
  return page
    .getByRole('term')
    .filter({ hasText: new RegExp(`^${term}$`) })
    .locator('xpath=following-sibling::dd[1]');
}

/** The Organizations list's row of an organization: its name, then its parent and namespace. */
function organizationRow(page: Page, name: string) {
  return page
    .getByRole('grid', { name: `Your organizations on ${lab.installation}` })
    .getByRole('row', { name: new RegExp(`^${name} `) });
}

test.describe('agents per organization', () => {
  test.skip(!KUBECONFIG, NEEDS_KUBECONFIG);

  test('a person in no organization is told so on the organizations list and the New agent form', async ({
    signInAs,
  }) => {
    test.setTimeout(3 * 60_000);
    const elsewhere = await bindingsOf(users.bob, 'tenant-b');
    test.skip(
      elsewhere.length > 0,
      `bob is bound by ${elsewhere.join(', ')} (another run's organization): the state needs a person in no organization`,
    );
    const bob = await signInAs(users.bob);
    await open(bob, '/organizations', users.bob);
    await expect(
      bob.getByRole('heading', { name: 'You belong to no organization' }),
    ).toBeVisible({ timeout: 60_000 });
    await open(bob, '/customize/agents/new', users.bob);
    await expect(
      bob.getByText(`You belong to no organization on ${lab.installation}`),
      'the wizard offers no place to create in',
    ).toBeVisible({ timeout: 60_000 });
  });

  test('a person in no organization, with no platform agent, sees who grants access, not an invitation', async ({
    signInAs,
  }) => {
    test.setTimeout(rosterWait + 60_000);
    const platform = await platformAgents();
    test.skip(
      platform.length > 0,
      `the platform tenant holds ${platform.join(', ')} (a platform agent an earlier run left, or the lab's own): the empty state needs a platform tenant with no agent`,
    );
    const bob = await signInAs(users.bob);
    await open(bob, '/customize/agents', users.bob);
    await expect(
      bob.getByText('No agents for you yet'),
      'the empty state for a person no organization binds',
    ).toBeVisible({ timeout: rosterWait });
    await expect(
      bob.getByText(/agent-platform:user.*agent-platform:editor/),
      'it names the roles that grant access',
    ).toBeVisible();
    await expect(
      bob.getByText('Create your first agent'),
      'no invitation to create where the person may not',
    ).toHaveCount(0);
  });

  test.describe('an organization’s agent', () => {
    test('the editor of one organization creates there: the wizard names the only organization and its runtime, the agent’s page its organization and creator, Edit and Delete', async ({
      organizationAgent,
      signInAs,
    }) => {
      test.setTimeout(rosterWait + 60_000);
      const alice = await signInAs(users.alice);
      await open(alice, '/customize/agents/new', users.alice);
      await openWizardMoreOptions(alice);
      await expect(
        alice.getByText(`Runs in Environment: ${lab.installation}`, {
          exact: true,
        }),
        'the lab’s only environment is named in a line under More options',
      ).toBeVisible({ timeout: 60_000 });
      await expect(
        alice.getByText(
          `Organization: ${organization}, the only organization you belong to on ${lab.installation}.`,
          { exact: true },
        ),
        'the only organization is picked and stated under More options, not offered',
      ).toBeVisible({ timeout: 60_000 });
      await expect(
        alice.getByText(
          `Preselected: ${lab.defaultModel}, the default model for ${inSentence}.`,
        ),
        'the organization’s own default model is preselected',
      ).toBeVisible({ timeout: 60_000 });
      await expect(
        alice
          .getByRole('list', { name: 'Runtime' })
          .or(alice.getByRole('radiogroup', { name: 'Runtime' }))
          .getByText('Platform default'),
        'the organization’s namespace offers the platform Harness the operator copies there',
      ).toBeVisible({ timeout: 60_000 });
      await expect(
        alice.getByText('Could not read the runtimes'),
        'its editor reads the organization’s Harnesses',
      ).toHaveCount(0);

      await open(alice, organizationAgent, users.alice);
      await expectAgentRendered(alice);
      await expect(fact(alice, 'Owner')).toHaveText(organization);
      await expect(fact(alice, 'Created by')).toHaveText(users.alice.email);
      await expect(editButton(alice), 'its editor may edit it').toBeVisible();
      await alice.getByRole('button', { name: 'Agent actions' }).click();
      await expect(
        alice.getByRole('menuitem', { name: /Delete agent/ }),
        'and delete it',
      ).toBeVisible();
      await alice.keyboard.press('Escape');
    });

    test('each member’s organizations list holds their own, and another organization’s page says they are not a member', async ({
      organizationAgent: _organizationAgent,
      signInAs,
    }) => {
      test.setTimeout(3 * 60_000);
      const alice = await signInAs(users.alice);
      await open(alice, '/organizations', users.alice);
      await expect(organizationRow(alice, organization)).toBeVisible({
        timeout: 60_000,
      });
      await expect(
        organizationRow(alice, LAB_ORGANIZATION),
        `alice is not listed as a member of ${LAB_ORGANIZATION}`,
      ).toHaveCount(0);
      await open(alice, organizationPath(LAB_ORGANIZATION), users.alice);
      await expect(
        alice.getByText(`You are not a member of ${LAB_ORGANIZATION}`),
      ).toBeVisible({ timeout: 60_000 });

      // A user of one organization and an editor of another belongs to both.
      const dev = await signInAs(lab.users.dev);
      await open(dev, '/organizations', lab.users.dev);
      await expect(organizationRow(dev, organization)).toBeVisible({
        timeout: 60_000,
      });
      await expect(organizationRow(dev, LAB_ORGANIZATION)).toBeVisible();
    });

    test('a user of the organization may use the agent, not change it', async ({
      organizationAgent,
      signInAs,
    }) => {
      test.setTimeout(rosterWait + 60_000);
      const dev = await signInAs(lab.users.dev);
      await open(dev, organizationAgent, lab.users.dev);
      await expect(
        dev.getByText('You can use this agent, not change it'),
      ).toBeVisible({ timeout: rosterWait });
      await expect(
        dev.getByText(
          `Editing and deleting the agents of ${inSentence} needs the agent-platform:editor role in its namespace`,
          { exact: false },
        ),
      ).toBeVisible();
      await expect(fact(dev, 'Owner')).toHaveText(organization);
      await expectAgentRendered(dev);
      await expect(editButton(dev), 'no Edit for a user').toHaveCount(0);
      await dev.getByRole('button', { name: 'Agent actions' }).click();
      await expect(
        dev.getByRole('menuitem', { name: /View manifest/ }),
        'the menu is open',
      ).toBeVisible();
      await expect(
        dev.getByRole('menuitem', {
          name: /Update all skills|Delete agent/,
        }),
        'no write in the actions menu for a user',
      ).toHaveCount(0);
      await dev.keyboard.press('Escape');
    });

    test('each person’s roster names the organizations; another organization’s agent is not listed', async ({
      organizationAgent: _organizationAgent,
      labAgent,
      signInAs,
    }) => {
      test.setTimeout(rosterWait * 3 + 60_000);
      // The developer belongs to both organizations: each row names its own.
      const dev = await signInAs(lab.users.dev);
      await open(dev, '/customize/agents', lab.users.dev);
      await searchRoster(dev, agent.name);
      await expect(
        rosterRowOf(dev, agent.name),
        `${agent.name} is listed with its organization`,
      ).toContainText(`Owner: ${organization}`, { timeout: rosterWait });
      // Beside the name, on its line and inside the row; its full name is the
      // name link's tooltip, since the link's hit area covers the row, the
      // organization's text included.
      const row = rosterRowOf(dev, agent.name);
      const link = rosterLinkOf(dev, agent.name);
      const named = row.getByText(`Owner: ${organization}`, {
        exact: true,
      });
      const [rowBox, linkBox, namedBox] = await Promise.all([
        row.boundingBox(),
        link.boundingBox(),
        named.boundingBox(),
      ]);
      expect(namedBox!.x, 'the organization follows the name').toBeGreaterThan(
        linkBox!.x + linkBox!.width - 1,
      );
      expect(namedBox!.y, 'on the name’s line').toBeLessThan(
        linkBox!.y + linkBox!.height,
      );
      expect(namedBox!.y + namedBox!.height).toBeGreaterThan(linkBox!.y);
      expect(
        namedBox!.x + namedBox!.width,
        'the organization is not cut off by the row',
      ).toBeLessThanOrEqual(rowBox!.x + rowBox!.width);
      await expect(link).toHaveAttribute(
        'title',
        `${agent.name}\nOwner: ${organization}`,
      );
      expect(
        await named.evaluate(element => {
          const box = element.getBoundingClientRect();
          return document
            .elementFromPoint(box.left + 4, box.top + box.height / 2)
            ?.closest('a')?.textContent;
        }),
        'pointing at the organization points at the name link',
      ).toBe(agent.name);
      /**
       * Where a row's connector column and favourite star start. Both have a
       * fixed width at the row's right, so they line up on every row —
       * whatever the row's connectors, none at all included. The
       * organization beside the name must not push them.
       */
      const columnsAt = async (name: string) => {
        const listItem = rosterRowOf(dev, name);
        const [connectors, star] = await Promise.all([
          listItem.getByTestId('agent-connectors').boundingBox(),
          listItem.getByRole('button', { name: / favorites$/ }).boundingBox(),
        ]);
        return { connectors: connectors!.x, star: star!.x };
      };
      const organizationRowColumns = await columnsAt(agent.name);
      // The lab organization's agent, its organization named beside it too.
      await searchRoster(dev, labAgent.name);
      await expect(
        rosterRowOf(dev, labAgent.name),
        `${labAgent.name} is listed with its organization`,
      ).toContainText(`Owner: ${LAB_ORGANIZATION}`, { timeout: rosterWait });
      const labRowColumns = await columnsAt(labAgent.name);
      expect(
        labRowColumns.connectors,
        'the connectors line up across organizations',
      ).toBeCloseTo(organizationRowColumns.connectors, 0);
      expect(
        labRowColumns.star,
        'the stars line up across organizations',
      ).toBeCloseTo(organizationRowColumns.star, 0);

      // alice belongs to the spec's organization alone.
      const alice = await signInAs(users.alice);
      await open(alice, '/customize/agents', users.alice);
      await searchRoster(alice, agent.name);
      await expect(rosterLinkOf(alice, agent.name)).toBeVisible({
        timeout: rosterWait,
      });
      await searchRoster(alice, labAgent.name);
      await expect(
        rosterLinkOf(alice, labAgent.name),
        'an organization alice is not bound in lists nothing for her',
      ).toHaveCount(0);

      const bob = await signInAs(users.bob);
      await open(bob, '/customize/agents', users.bob);
      for (const name of [agent.name, labAgent.name]) {
        await searchRoster(bob, name);
        await expect(
          rosterLinkOf(bob, name),
          `${name} is in an organization bob is not bound in`,
        ).toHaveCount(0);
      }
    });

    test('a user’s deep link to the edit page is refused up front', async ({
      organizationAgent,
      signInAs,
    }) => {
      test.setTimeout(rosterWait + 60_000);
      const dev = await signInAs(lab.users.dev);
      await open(dev, `${organizationAgent}/edit`, lab.users.dev);
      await expect(
        dev.getByText('You cannot change this agent'),
        'the refusal naming the role, not a failed read',
      ).toBeVisible({ timeout: rosterWait });
      await expect(
        dev.getByText(
          `Changing the agents of ${inSentence} needs the agent-platform:editor role`,
          { exact: false },
        ),
      ).toBeVisible();
    });

    test('“Created by: Me” keeps the person’s own agents, and is offered only to a person who made one', async ({
      organizationAgent: _organizationAgent,
      labAgent,
      signInAs,
    }) => {
      test.setTimeout(rosterWait * 2 + 60_000);
      const createdByMe = async (page: Page) => {
        await page
          .getByRole('button', { name: /Filter by created by/ })
          .click();
        await page.getByRole('option', { name: /^Me/ }).click();
        await page.keyboard.press('Escape');
      };
      const alice = await signInAs(users.alice);
      await open(alice, '/customize/agents', users.alice);
      await expect(rosterLinkOf(alice, agent.name)).toBeVisible({
        timeout: rosterWait,
      });
      await createdByMe(alice);
      await expect(
        rosterLinkOf(alice, agent.name),
        'alice created the organization’s agent',
      ).toBeVisible();

      // The developer reads both agents and made neither: the bar offers no
      // "Created by" to filter on.
      const dev = await signInAs(lab.users.dev);
      await open(dev, '/customize/agents', lab.users.dev);
      await expect(rosterLinkOf(dev, labAgent.name)).toBeVisible({
        timeout: rosterWait,
      });
      await expect(rosterLinkOf(dev, agent.name)).toBeVisible();
      await expect(
        dev.getByRole('button', { name: /Filter by created by/ }),
        'no row is the developer’s',
      ).toHaveCount(0);
    });
  });
});
