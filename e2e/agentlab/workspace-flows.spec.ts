import type { Page, Route } from '@playwright/test';

import {
  expect,
  open,
  openReadyAgent,
  startSessionButton,
  test,
} from './fixtures';
import { lab, RUN } from './lab';
import type { WorkspaceSource } from '../../plugins/agent-platform/src/lib/workspaceManager';

/**
 * The workspace editor's repository picker and the composer's refusal of a
 * workspace start, as the ux-review of the workspace flows left them
 * (giantswarm/backstage#2871).
 *
 * A provider owner's repositories need the person's own grant of a real
 * provider App, which no headless run makes, so the provider's side is staged
 * at the browser in the workspace-manager's own shapes: one connected
 * instance, its owner, a page of its repositories and the preview. The
 * refusal is `authorize_workspace` naming the repositories the person cannot
 * read, so no Session is started.
 */

type ToolCall = { name?: string; arguments?: Record<string, unknown> };

const TOOL = 'x_workspace-manager_';
const PROVIDER = 'e2e-github';
const OWNER = 'e2e-owner';
const WORKSPACE = `e2e-refused-${RUN}`;
const UNREADABLE = [`${OWNER}/private-one`, `${OWNER}/private-two`];
const NOW = new Date().toISOString();

const REPOSITORIES = ['alpha', 'beta', 'gamma'].map(name => ({
  name,
  language: 'Go',
  topics: ['mcp'],
  lastPush: NOW,
  sizeKiB: 512,
}));

/**
 * The provider's side of the editor, staged, with the person signed in to
 * workspace-manager; every other call goes through.
 */
async function stageProvider(page: Page): Promise<ToolCall[]> {
  const previews: ToolCall[] = [];
  await page.route('**/api/muster/auth/status**', async (route: Route) => {
    const answer = await (await route.fetch()).json();
    const servers: Array<{ name: string }> = answer?.servers ?? [];
    await route.fulfill({
      json: {
        ...answer,
        servers: [
          ...servers.filter(s => s.name !== 'workspace-manager'),
          { name: 'workspace-manager', status: 'connected' },
        ],
      },
    });
  });
  await page.route('**/api/muster/call**', async (route: Route) => {
    const call = route.request().postDataJSON() as ToolCall;
    const args = call?.arguments ?? {};
    switch (call?.name) {
      case `${TOOL}list_workspaces`:
        await route.fulfill({
          json: { workspaces: [], organizations: ['lab'] },
        });
        return;
      case `${TOOL}list_providers`:
        await route.fulfill({
          json: {
            providers: [
              {
                name: PROVIDER,
                kind: 'github',
                host: 'github.com',
                connected: true,
                login: 'e2e-admin',
              },
            ],
          },
        });
        return;
      case `${TOOL}list_owners`:
        await route.fulfill({
          json: { owners: [{ name: OWNER, kind: 'organization' }] },
        });
        return;
      case `${TOOL}list_repositories`: {
        const search = String(args.search ?? '');
        const rows = REPOSITORIES.filter(r => r.name.includes(search));
        await route.fulfill({
          json: {
            provider: PROVIDER,
            owner: OWNER,
            total: rows.length,
            ownerTotal: REPOSITORIES.length,
            page: 1,
            pageSize: Number(args.pageSize ?? 25),
            repositories: rows,
            languages: ['Go'],
            topics: ['mcp'],
          },
        });
        return;
      }
      case `${TOOL}preview_workspace`: {
        previews.push(call);
        const sources = (args.sources ?? []) as Array<{
          repositories?: string[];
        }>;
        const picked = sources.flatMap(source => source.repositories ?? []);
        await route.fulfill({
          json: {
            total: picked.length,
            excluded: 0,
            skippedArchived: 0,
            skippedForks: 0,
            providerSizeKiB: picked.length * 512,
            estimatedVolumeSize: '1Gi',
            matching: picked.length,
            page: 1,
            pageSize: 25,
            repositories: picked.map(repository => ({
              provider: PROVIDER,
              repository: `${OWNER}/${repository}`,
              language: 'Go',
              topics: ['mcp'],
              lastPush: NOW,
              sizeKiB: 512,
              why: ['name'],
            })),
          },
        });
        return;
      }
      default:
        await route.fallback();
    }
  });
  return previews;
}

async function stageEditor(page: Page, filtered: boolean) {
  await stageProvider(page);
  const writes: ToolCall[] = [];
  const workspace = {
    name: WORKSPACE,
    organization: 'lab',
    sources: [
      {
        provider: PROVIDER,
        owner: OWNER,
        repositories: ['alpha', 'beta'],
        ...(filtered ? { filters: { languages: ['Go'] } } : {}),
      },
    ],
    resourceVersion: '1',
    createdAt: NOW,
    repositories: 2,
    sessions: 0,
  };
  await page.route('**/api/muster/call**', async route => {
    const call = route.request().postDataJSON() as ToolCall;
    if (call.name === `${TOOL}get_workspace`) {
      await route.fulfill({
        json: {
          workspace,
          mirrors: [],
          storage: { mirrorsBytes: 0, sessionsBytes: 0 },
          sessionDirectories: [],
        },
      });
    } else if (call.name === `${TOOL}update_workspace`) {
      writes.push(call);
      await route.fulfill({ json: { ...workspace, ...call.arguments } });
    } else if (call.name === `${TOOL}preview_workspace`) {
      const sources = (call.arguments?.sources ?? []) as WorkspaceSource[];
      const selected = REPOSITORIES.filter(repository =>
        sources.some(
          source =>
            !source.exclude?.includes(repository.name) &&
            (source.repositories?.includes(repository.name) ||
              source.filters?.languages?.includes(repository.language)),
        ),
      );
      await route.fulfill({
        json: {
          total: selected.length,
          excluded: REPOSITORIES.length - selected.length,
          skippedArchived: 0,
          skippedForks: 0,
          providerSizeKiB: selected.length * 512,
          estimatedVolumeSize: '1Gi',
          matching: selected.length,
          page: 1,
          pageSize: 25,
          repositories: selected.map(repository => ({
            ...repository,
            provider: PROVIDER,
            repository: `${OWNER}/${repository.name}`,
            why: ['name'],
          })),
        },
      });
    } else {
      await route.fallback();
    }
  });
  await open(
    page,
    `/customize/workspaces/${lab.installation}/lab/${WORKSPACE}/edit`,
  );
  return writes;
}

test('the selected workspace repositories keep filter exclusions, column names and keyboard focus', async ({
  admin,
}) => {
  const writes = await stageEditor(admin, true);
  const picker = admin.getByTestId('repository-picker');
  const table = picker.getByRole('table', { name: 'Selected repositories' });
  await expect(
    table.getByRole('columnheader').allTextContents(),
  ).resolves.toEqual(['Repository', 'Selection']);
  const alpha = table.getByRole('checkbox', { name: 'alpha', exact: true });
  await alpha.focus();
  await admin.keyboard.press('Space');
  const excluded = table.getByRole('checkbox', {
    name: 'Include alpha',
    exact: true,
  });
  await expect(excluded).not.toBeChecked();
  await expect(excluded).toBeFocused();
  await expect(admin.getByTestId('workspace-preview')).toContainText(
    `${OWNER}/gamma`,
  );
  await expect(admin.getByTestId('workspace-preview')).not.toContainText(
    `${OWNER}/alpha`,
  );
  await admin.getByRole('button', { name: 'Save changes' }).click();
  await expect.poll(() => writes.length).toBe(1);
  const sources = writes[0].arguments?.sources as WorkspaceSource[];
  expect(sources[0].exclude).toEqual(['alpha']);
});

test('the selected workspace repositories move keyboard focus between rows and back to browsing', async ({
  admin,
}) => {
  await stageEditor(admin, false);
  const picker = admin.getByTestId('repository-picker');
  const alpha = picker.getByRole('checkbox', { name: 'alpha', exact: true });
  await alpha.focus();
  await admin.keyboard.press('Space');
  await expect(
    picker.getByRole('checkbox', { name: 'beta', exact: true }),
  ).toBeFocused();
  await admin.keyboard.press('Space');
  await expect(
    picker.getByRole('switch', { name: 'Show selected only (0)' }),
  ).toBeFocused();
  await admin.keyboard.press('Space');
  await expect(picker.getByRole('searchbox')).toBeVisible();
});

test('workspace provider failures keep technical messages folded away', async ({
  admin,
}) => {
  await stageEditor(admin, false);
  await admin.route('**/api/muster/call**', async route => {
    const call = route.request().postDataJSON() as ToolCall;
    if (call.name === `${TOOL}list_providers`) {
      await route.fulfill({
        status: 500,
        json: {
          error: {
            message:
              'Tool execution failed: tool not found: x_workspace-manager_list_providers',
          },
        },
      });
    } else {
      await route.fallback();
    }
  });
  await admin.reload();
  await expect(admin.getByText('Could not read the providers')).toBeVisible();
  const details = admin.getByText(
    /tool not found: x_workspace-manager_list_providers/,
  );
  await expect(details).not.toBeVisible();
  const trigger = admin.getByRole('button', { name: 'Technical details' });
  await trigger.focus();
  await admin.keyboard.press('Enter');
  await expect(details).toBeVisible();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
});

test('the repository picker names its columns, and a pick by name reaches the preview', async ({
  admin,
}) => {
  const previews = await stageProvider(admin);
  await open(admin, '/customize/workspaces');
  await admin.getByRole('link', { name: 'New workspace' }).first().click();

  const source = admin.getByRole('region', { name: 'Source 1' });
  await source.getByRole('button', { name: /Owner$/ }).click();
  await admin.getByRole('option', { name: OWNER }).click();

  const table = source.getByRole('table', { name: `Repositories of ${OWNER}` });
  await expect(
    table.getByRole('columnheader').allTextContents(),
  ).resolves.toEqual([
    'Repository',
    'Language',
    'Topics',
    'Last push',
    'Selection',
  ]);

  // bui's react-aria input is visually hidden: a person clicks its label.
  const beta = table.getByRole('checkbox', { name: 'beta' });
  await beta.locator('xpath=ancestor::label[1]').click();
  await expect(beta).toBeChecked();
  await expect(source.getByTestId('repository-summary')).toHaveText(
    '1 by name = 1 repository',
  );
  const preview = admin.getByTestId('workspace-preview');
  await expect(preview.getByTestId('preview-total')).toContainText(
    '1 repository',
  );
  await expect(preview).toContainText(`${OWNER}/beta`);
  expect(previews.length).toBeGreaterThan(0);
});

test('a refused workspace start names the repositories and says what to do', async ({
  admin,
  labAgent,
}) => {
  test.setTimeout(6 * 60_000);
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
              resourceVersion: '1',
              createdAt: NOW,
              repositories: 5,
              sessions: 0,
              lastSync: { time: NOW, result: 'Succeeded' },
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
        json: {
          workspace: WORKSPACE,
          outcome: 'refused',
          reason: `${UNREADABLE.length} repositories are not readable`,
          unreadable: UNREADABLE,
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
  await promptBox.fill('List the repositories of this workspace.');
  await admin.getByRole('button', { name: 'Start', exact: true }).click();

  const refusal = admin.getByRole('alert').filter({
    hasText: `You cannot read 2 repositories of ${WORKSPACE}`,
  });
  await expect(refusal).toBeVisible({ timeout: 60_000 });
  for (const repository of UNREADABLE) {
    await expect(refusal).toContainText(repository);
  }
  await expect(refusal).toContainText(
    'Ask an owner of these repositories for access',
  );
  await expect(
    refusal.getByRole('button', { name: 'Start without workspace' }),
  ).toBeVisible();
  expect(checks).toHaveLength(1);
  await expect(admin).not.toHaveURL(/\/sessions\/[^/]+\/[^/]+$/);
});

test('a workspace takes any name and says the technical name it gets', async ({
  admin,
}) => {
  await stageProvider(admin);
  await open(admin, '/customize/workspaces');
  await admin.getByRole('link', { name: 'New workspace' }).first().click();

  await admin.getByRole('textbox', { name: /^Name/ }).fill('My Workspace');
  await expect(admin.getByText(/Its technical name is/)).toHaveText(
    'Its technical name is my-workspace; it cannot be changed once the workspace exists.',
  );

  await admin.getByRole('button', { name: 'Advanced options' }).click();
  const technical = admin.getByRole('textbox', { name: /^Technical name/ });
  await expect(technical).toHaveValue('my-workspace');
  await technical.fill('platform-repos');
  await admin.getByRole('textbox', { name: /^Name/ }).fill('Something else');
  await expect(technical).toHaveValue('platform-repos');
});
