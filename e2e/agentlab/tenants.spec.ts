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
 * Agents per tenant (giantswarm/giantswarm#36698 D6, giantswarm/backstage#2606),
 * the portal half of agentlab's `tenants-test` (giantswarm/agentlab#166), in
 * a browser: what only a page shows. An organization namespace
 * `org-e2e-tenants`, labelled as a tenant, where the lab's developer is an
 * `agent-platform:editor` and the tenant group `tenant-a` (alice) an
 * `agent-platform:user`; bob (`tenant-b`) is bound in no organization. The
 * kagent controller's Kubernetes authorizer and agent-manager's tenant
 * reconciler decide; the lab's API server spells a subject `oidc:<name>`.
 *
 * Every test stands alone, so a red one leaves the others run: the ones on
 * the organization's agent ask for {@link TenantFixtures.tenantAgent}, which
 * the worker sets up once, and again in the next worker after a red test.
 *
 * One worker, one run per lab: the developer must be the editor of exactly
 * one organization, the only tenant the wizard names, so the spec has one
 * organization namespace, and a second worker's or run's teardown would
 * delete it under the first. The fixture refuses `AGENTLAB_E2E_WORKERS` above
 * 1; two runs on one lab are not detected.
 *
 * Needs a lab with `platform.tenants` (`AGENTLAB_TENANTS=1`: alice and bob,
 * kagent 1.19 with `kagent.controller.authorization.mode: kubernetes`) and
 * `AGENTLAB_KUBECONFIG` for the namespace and its RoleBindings.
 */
const TENANTS = process.env.AGENTLAB_TENANTS === '1';
const NEEDS_TENANTS =
  'needs a lab with platform.tenants (agentlab configure --tenants): set AGENTLAB_TENANTS=1';

const users = {
  alice: { email: 'alice@lab.local', name: 'Lab Tenant A' },
  bob: { email: 'bob@lab.local', name: 'Lab Tenant B' },
} satisfies Record<string, LabUser>;

const organization = 'e2e-tenants';
const namespace = `org-${organization}`;
/** The organization as a sentence names it. */
const inSentence = `the ${organization} organization`;
/** The lab API server's `--oidc-username-prefix` and groups prefix. */
const subjectPrefix = 'oidc:';
const rosterWait = 2 * 60_000;

/** The organization's agent: named by the run (`AGENTLAB_E2E_RUN`). */
const agent = {
  name: `E2E Tenant ${RUN}`,
  slug: `e2e-tenant-${RUN}`,
};
const detailPath = `/customize/agents/${lab.installation}/${namespace}/${agent.slug}`;

type TenantFixtures = {
  /**
   * The organization's agent, created by its editor in the New agent wizard
   * the first time a test of the worker asks for it, in the namespace this
   * spec labels and binds ({@link applyTenant}), and rendered past Deploying;
   * its detail page's path. One the run made already (an earlier worker's
   * teardown that did not remove it) is used as it is. When the worker ends,
   * also after a red test, the editor deletes it in the portal where the
   * wizard put it, and the namespace goes with its RoleBindings, whatever the
   * deletion did. A failed creation or render fails the later workers of the
   * run at once.
   */
  tenantAgent: string;
};

/** Where a worker records a failed `tenantAgent` setup for the rest of the run. */
function setupFailureFile(outputDir: string): string {
  return join(outputDir, 'tenant-agent-setup-failed.txt');
}

const test = base.extend<{}, TenantFixtures>({
  tenantAgent: [
    async ({ browser, variant }, use, workerInfo) => {
      if (workerInfo.config.workers > 1) {
        throw new Error(
          `tenants.spec.ts runs on one worker, not ${workerInfo.config.workers}: its one organization namespace would be deleted by one worker's teardown under another (run with AGENTLAB_E2E_WORKERS=1 and no --workers above 1)`,
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
      let dev: Page | undefined;
      let createdAt: string | undefined;
      let rendered = false;
      try {
        await applyTenant();
        context = await browser.newContext(contextOptionsFor(variant));
        dev = await context.newPage();
        await signIn(dev, lab.users.dev);
        try {
          if (await agentExists()) {
            createdAt = detailPath;
            await open(dev, createdAt, lab.users.dev);
          } else {
            createdAt = await createAgentInWizard(dev, agent.name, agent.slug);
            expect(
              createdAt,
              'the wizard creates in the only organization its editor may create in',
            ).toContain(`/${namespace}/${agent.slug}`);
          }
          // The first agent in a new namespace waits for Flux to pull the
          // agent chart: the tests then find it rendered.
          await expectAgentRendered(dev);
          rendered = true;
        } catch (error) {
          mkdirSync(workerInfo.project.outputDir, { recursive: true });
          writeFileSync(failureFile, String(error));
          throw error;
        }
        await use(createdAt);
      } finally {
        try {
          // Where the wizard put it, a wrong tenant too; without the wizard's
          // hand-off, the organization's, if Create got that far. One in the
          // organization that never rendered goes with the namespace: the
          // portal's deletion would wait for the render again.
          const at =
            createdAt ?? ((await agentExists()) ? detailPath : undefined);
          if (dev && at && (rendered || at !== detailPath)) {
            await deleteAgentInPortal(dev, at, agent.slug);
          }
        } finally {
          await context?.close();
          await kubectl([
            'delete',
            'namespace',
            namespace,
            '--ignore-not-found',
            '--wait=false',
          ]);
        }
      }
    },
    // One budget for setup and teardown, and the teardown does not run once
    // it is spent: the wizard and the agent's first render on a cold lab (up
    // to AGENT_RENDER_TIMEOUT), then the deletion's render and roster waits
    // and Flux's uninstall.
    { scope: 'worker', timeout: 25 * 60_000 },
  ],
});

function binding(name: string, role: string, subject: object) {
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

/** The organization namespace and its two RoleBindings, applied again as they are. */
async function applyTenant() {
  // A worker right after another's teardown finds the namespace still
  // terminating, where the API server takes no new RoleBinding.
  const { stdout: phase } = await kubectl([
    'get',
    'namespace',
    namespace,
    '--ignore-not-found',
    '-o',
    'jsonpath={.status.phase}',
  ]);
  if (phase === 'Terminating') {
    await kubectl([
      'wait',
      '--for=delete',
      `namespace/${namespace}`,
      '--timeout=3m',
    ]);
  }
  const objects = [
    {
      apiVersion: 'v1',
      kind: 'Namespace',
      metadata: {
        name: namespace,
        labels: { 'giantswarm.io/organization': organization },
      },
    },
    binding('e2e-tenants-editor', 'agent-platform:editor', {
      kind: 'User',
      name: `${subjectPrefix}${lab.users.dev.email}`,
    }),
    binding('e2e-tenants-users', 'agent-platform:user', {
      kind: 'Group',
      name: `${subjectPrefix}tenant-a`,
    }),
  ];
  await kubectl(
    ['apply', '-f', '-'],
    JSON.stringify({ apiVersion: 'v1', kind: 'List', items: objects }),
  );
}

/** Whether the run's agent has a HelmRelease in the organization namespace. */
async function agentExists(): Promise<boolean> {
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

test.describe('agents per tenant', () => {
  test.skip(!TENANTS, NEEDS_TENANTS);
  test.skip(!KUBECONFIG, NEEDS_KUBECONFIG);

  test('a person in no organization, with no platform agent, sees who grants access, not an invitation', async ({
    signInAs,
  }) => {
    test.setTimeout(rosterWait + 60_000);
    const platform = await platformAgents();
    test.skip(
      platform.length > 0,
      `the platform tenant holds ${platform.join(', ')} (a platform agent an earlier run left, or the labAgent of a parallel worker or run): the empty state needs a platform tenant with no agent`,
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
    test('the editor of one organization creates there: the wizard names the only organization, the agent’s page its organization and creator, Edit and Delete', async ({
      tenantAgent,
      signInAs,
    }) => {
      test.setTimeout(rosterWait + 60_000);
      const dev = await signInAs(lab.users.dev);
      await open(dev, '/customize/agents/new', lab.users.dev);
      await expect(
        dev.getByText(
          `The agent belongs to ${inSentence}: on ${lab.installation}, you may create agents only there.`,
        ),
        'the only organization is picked and named, not offered',
      ).toBeVisible({ timeout: 60_000 });
      await openWizardMoreOptions(dev);
      await expect(
        dev.getByText(
          `The agents of ${inSentence} run on the platform Harness.`,
        ),
        'the organization runs its agents on the platform Harness, the only runtime offered',
      ).toBeVisible({ timeout: 60_000 });
      await expect(
        dev.getByText('Could not read the runtimes'),
        'no warning for the platform namespace an organization’s editor may not read',
      ).toHaveCount(0);

      await open(dev, tenantAgent, lab.users.dev);
      await expectAgentRendered(dev);
      await expect(fact(dev, 'Organization')).toHaveText(organization);
      await expect(fact(dev, 'Created by')).toHaveText(lab.users.dev.email);
      await expect(editButton(dev), 'its editor may edit it').toBeVisible();
      await dev.getByRole('button', { name: 'Agent actions' }).click();
      await expect(
        dev.getByRole('menuitem', { name: /Delete agent/ }),
        'and delete it',
      ).toBeVisible();
      await dev.keyboard.press('Escape');
    });

    test('a user of the organization may use the agent, not change it', async ({
      tenantAgent,
      signInAs,
    }) => {
      test.setTimeout(rosterWait + 60_000);
      const alice = await signInAs(users.alice);
      await open(alice, tenantAgent, users.alice);
      await expect(
        alice.getByText('You can use this agent, not change it'),
      ).toBeVisible({ timeout: rosterWait });
      await expect(
        alice.getByText(
          `Editing and deleting the agents of ${inSentence} needs the agent-platform:editor role in its namespace`,
          { exact: false },
        ),
      ).toBeVisible();
      await expect(fact(alice, 'Organization')).toHaveText(organization);
      await expectAgentRendered(alice);
      await expect(editButton(alice), 'no Edit for a user').toHaveCount(0);
      await alice.getByRole('button', { name: 'Agent actions' }).click();
      await expect(
        alice.getByRole('menuitem', { name: /View manifest/ }),
        'the menu is open',
      ).toBeVisible();
      await expect(
        alice.getByRole('menuitem', {
          name: /Update all skills|Delete agent/,
        }),
        'no write in the actions menu for a user',
      ).toHaveCount(0);
      await alice.keyboard.press('Escape');
    });

    test('each person’s roster names the organizations; another organization’s agent is not listed', async ({
      tenantAgent: _tenantAgent,
      labAgent,
      signInAs,
    }) => {
      test.setTimeout(rosterWait * 2 + 60_000);
      const alice = await signInAs(users.alice);
      await open(alice, '/customize/agents', users.alice);
      await searchRoster(alice, agent.name);
      await expect(
        rosterRowOf(alice, agent.name),
        `${agent.name} is listed with its organization`,
      ).toContainText(`Organization: ${organization}`, { timeout: rosterWait });
      // Beside the name, on its line and inside the row; its full name is the
      // name link's tooltip, since the link's hit area covers the row, the
      // organization's text included.
      const row = rosterRowOf(alice, agent.name);
      const link = rosterLinkOf(alice, agent.name);
      const named = row.getByText(`Organization: ${organization}`, {
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
        `${agent.name}\nOrganization: ${organization}`,
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
      /** Where a row's first fact starts: the same on every row. */
      const firstFactX = async (name: string) =>
        (await rosterRowOf(alice, name)
          .getByTestId('agent-facts')
          .locator(':scope > *')
          .first()
          .boundingBox())!.x;
      const organizationRowFactX = await firstFactX(agent.name);
      // The platform's agent belongs to no organization, and its row says
      // nothing of one.
      await searchRoster(alice, labAgent.name);
      await expect(rosterLinkOf(alice, labAgent.name)).toBeVisible({
        timeout: rosterWait,
      });
      expect(
        await firstFactX(labAgent.name),
        'the platform agent’s facts line up with the organization’s agent’s',
      ).toBeCloseTo(organizationRowFactX, 0);
      await expect(
        rosterRowOf(alice, labAgent.name).getByText(
          /^(None|Organization: .*)$/,
        ),
        'the platform agent’s row names no organization',
      ).toHaveCount(0);
      await expect(
        rosterRowOf(alice, labAgent.name).getByRole('button', {
          name: 'What None means',
        }),
      ).toHaveCount(0);

      const bob = await signInAs(users.bob);
      await open(bob, '/customize/agents', users.bob);
      await searchRoster(bob, labAgent.name);
      await expect(rosterLinkOf(bob, labAgent.name)).toBeVisible({
        timeout: rosterWait,
      });
      await searchRoster(bob, agent.name);
      await expect(
        rosterLinkOf(bob, agent.name),
        'an organization bob is not bound in lists nothing for him',
      ).toHaveCount(0);
    });

    test('a user’s deep link to the edit page is refused up front', async ({
      tenantAgent,
      signInAs,
    }) => {
      test.setTimeout(rosterWait + 60_000);
      const alice = await signInAs(users.alice);
      await open(alice, `${tenantAgent}/edit`, users.alice);
      await expect(
        alice.getByText('You cannot change this agent'),
        'the refusal naming the role, not a failed read',
      ).toBeVisible({ timeout: rosterWait });
      await expect(
        alice.getByText(
          `Changing the agents of ${inSentence} needs the agent-platform:editor role`,
          { exact: false },
        ),
      ).toBeVisible();
    });

    test('“Created by: Me” keeps the person’s own agents', async ({
      tenantAgent: _tenantAgent,
      labAgent,
      signInAs,
    }) => {
      test.setTimeout(rosterWait + 60_000);
      const dev = await signInAs(lab.users.dev);
      await open(dev, '/customize/agents', lab.users.dev);
      await expect(rosterLinkOf(dev, labAgent.name)).toBeVisible({
        timeout: rosterWait,
      });
      await dev.getByRole('button', { name: /Filter by created by/ }).click();
      await dev.getByRole('option', { name: /^Me/ }).click();
      await dev.keyboard.press('Escape');
      await expect(rosterLinkOf(dev, agent.name)).toBeVisible();
      await expect(
        rosterLinkOf(dev, labAgent.name),
        'the admin’s platform agent is not the developer’s',
      ).toHaveCount(0);
    });
  });
});
