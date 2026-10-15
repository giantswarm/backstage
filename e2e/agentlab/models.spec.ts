import type { Page } from '@playwright/test';
import {
  createAgentInWizard,
  deleteAgentInPortal,
  expect,
  open,
  startSessionOnReadyAgent,
  test,
} from './fixtures';
import { lab } from './lab';
import { modelManagerUnavailable } from './model-manager.fixture';

/**
 * Models in the agent shell: the installation's `ModelConfig`s read through
 * the Kubernetes proxy with the person's token, as Customize's Models tab
 * (the lab always provisions `default-model-config`, its `aiModel`, so the
 * table has a row to show), and Model hosting's tabs under it.
 */

test('Customize · Models lists the lab default ModelConfig and offers Connect a model', async ({
  admin,
}) => {
  // Read first: it loads a page of its own to read the portal's tokens.
  const noServingLayer = await modelManagerUnavailable(admin);
  // The old address of the list lands on Customize's Models tab.
  await open(admin, '/agent-platform/models');
  await expect(admin).toHaveURL(/\/customize\/models$/);
  await expect(
    admin.getByRole('main').getByRole('tab', { name: /^Models/ }),
  ).toHaveAttribute('aria-selected', 'true');
  await expect(
    admin.getByRole('link', { name: 'Connect a model' }),
  ).toHaveAttribute('href', '/agent-platform/models/new');
  await expect(
    admin.getByRole('rowheader', { name: /^default-model-config/ }),
    'the ModelConfig the lab provisions is listed',
  ).toBeVisible();
  // The way into Model hosting, where the installation has a serving layer:
  // a lab without model-manager has none, and the card is left out.
  const hosting = admin.getByRole('link', { name: 'Model hosting' });
  if (noServingLayer) {
    await expect(
      hosting,
      'no serving layer: no Model hosting card',
    ).toHaveCount(0);
  } else {
    await expect(hosting).toHaveAttribute(
      'href',
      '/agent-platform/models/serving',
    );
  }
});

test('the old Model configs path still resolves', async ({ admin }) => {
  // The list used to live at `/models/configs`, with the create and detail
  // flows beneath it. Bookmarks and links from an older release carry those
  // paths, so they redirect rather than 404.
  await open(admin, '/agent-platform/models/configs');
  await expect(admin).toHaveURL(/\/customize\/models$/);
  await expect(
    admin.getByRole('rowheader', { name: /^default-model-config/ }),
    'the redirect lands on the list, not an empty page',
  ).toBeVisible();
});

test('a model’s page sits under Customize in tabs, says why in Technical details, and its old paths redirect', async ({
  admin,
}) => {
  await open(admin, '/customize/models');
  await admin
    .getByRole('rowheader', { name: /^default-model-config/ })
    .getByRole('link')
    .click();
  const detail = new RegExp(
    `/customize/models/${lab.installation}/([^/]+)/default-model-config$`,
  );
  await expect(admin).toHaveURL(detail);
  const namespace = detail.exec(new URL(admin.url()).pathname)?.[1];
  const modelPath = `/customize/models/${lab.installation}/${namespace}/default-model-config`;

  // Overview, the model's own address: its facts in the one column, none
  // beside the content, then Technical details. Used by counts the agents
  // that run on it once they are read.
  await expect(admin.getByRole('tab')).toHaveText([
    'Overview',
    'Usage',
    /^Used by \(\d+\)$/,
  ]);
  await expect(
    admin
      .getByRole('region', { name: 'Model details', exact: true })
      .getByText('Model ID', { exact: true }),
  ).toBeVisible();
  await expect(admin.getByRole('main').getByRole('complementary')).toHaveCount(
    0,
  );
  // The lab's model works, so nothing says agents cannot use it.
  await expect(
    admin.getByRole('main').getByText('Ready', { exact: true }).first(),
  ).toBeVisible();
  await expect(
    admin.getByText('Agents cannot use this model', { exact: true }),
  ).toHaveCount(0);
  await expect(
    admin.getByRole('button', { name: 'Show conditions', exact: true }),
  ).toHaveCount(0);

  // The conditions behind the status, folded in place at Overview's foot as
  // on the agent page. Once the read settles on Ready the fold-out is closed
  // (it opens on arrival only for a model that is not accepted); the
  // assertions retry until then, so a page drawn from the cache first cannot
  // race the click.
  const technical = admin.getByRole('button', {
    name: 'Technical details',
    exact: true,
  });
  await expect(technical).toHaveAttribute('aria-expanded', 'false');
  await technical.click();
  await expect(technical).toHaveAttribute('aria-expanded', 'true');
  await expect(
    admin.getByRole('heading', { level: 4, name: /^Accepted/ }),
  ).toBeVisible();

  await admin.getByRole('tab', { name: 'Usage', exact: true }).click();
  await expect(admin).toHaveURL(new RegExp(`${modelPath}/usage$`));

  await admin.getByRole('tab', { name: /^Used by/ }).click();
  await expect(admin).toHaveURL(new RegExp(`${modelPath}/used-by$`));
  await expect(
    admin
      .getByRole('grid', { name: 'Agents using this model', exact: true })
      .or(admin.getByText('No agent runs on this model yet.', { exact: true })),
  ).toBeVisible();

  // The former Details tab's address lands on Overview, where its Technical
  // details went.
  await open(admin, `${modelPath}/details`);
  await expect(admin).toHaveURL(detail);
  await expect(
    admin.getByRole('tab', { name: 'Overview', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');

  // The address the page used to have still lands on it, on Overview.
  await open(
    admin,
    `/agent-platform/models/${lab.installation}/${namespace}/default-model-config`,
  );
  await expect(admin).toHaveURL(detail);
  await expect(
    admin.getByRole('tab', { name: 'Overview', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
});

test('Model hosting’s Running models and GPU tabs render for the installation', async ({
  admin,
}) => {
  const unavailable = await modelManagerUnavailable(admin);
  test.skip(!!unavailable, unavailable);
  await open(admin, '/agent-platform/models/serving');
  await expect(
    admin.getByRole('heading', { level: 1, name: 'Model hosting' }),
  ).toBeVisible();
  await expect(
    admin.getByRole('tab', { name: 'Running models' }),
  ).toHaveAttribute('aria-selected', 'true');
  await expect(admin.getByRole('article').first()).toBeVisible();

  // "GPU pools" where cluster-manager runs, "GPU capacity" (nodes only)
  // where it does not.
  await open(admin, '/agent-platform/models/capacity');
  await expect(
    admin.getByRole('tab', { name: /^GPU (pools|capacity)$/ }),
  ).toHaveAttribute('aria-selected', 'true');
  await expect(admin.getByRole('article').first()).toBeVisible();
});

// --- Vertex AI ---------------------------------------------------------------

type VertexModel = {
  provider: 'Claude on Vertex AI' | 'Gemini on Vertex AI';
  displayName: string;
  model: string;
  location: string;
  /** A key file on disk, or the text of one. */
  key: { file: string } | { content: string };
};

/** A service account key of the shape kagent checks, signing nothing. */
function fakeServiceAccountKey(projectID: string): string {
  return JSON.stringify({
    type: 'service_account',
    project_id: projectID,
    private_key_id: 'e2e',
    private_key:
      '-----BEGIN PRIVATE KEY-----\nnot-a-key\n-----END PRIVATE KEY-----\n',
    client_email: `e2e@${projectID}.iam.gserviceaccount.com`,
    token_uri: 'https://oauth2.googleapis.com/token',
  });
}

/**
 * Answers the MCP server sign-in notice with Not now whenever it shows: on a
 * lab with an OAuth MCP server it docks over the form's footer, where Connect
 * model is.
 */
async function dismissMcpSignInNotice(page: Page) {
  await page.addLocatorHandler(
    page.getByRole('complementary', { name: 'MCP server sign-in' }),
    async notice => {
      await notice.getByRole('button', { name: 'Not now' }).click();
    },
  );
}

/** Fills Connect a model for a Vertex AI model, up to the submit. */
async function fillVertexModel(page: Page, model: VertexModel) {
  await open(page, '/agent-platform/models/new');
  await page.getByRole('button', { name: /Provider/ }).click();
  await page.getByRole('option', { name: model.provider }).click();
  await page
    .getByRole('textbox', { name: 'Name', exact: true })
    .fill(model.displayName);
  await page.getByRole('textbox', { name: /^Location/ }).fill(model.location);
  await chooseKeyFile(page, model.key);
  await expect(keyGroup(page).getByRole('status')).toContainText('Read from');
  await page.getByRole('textbox', { name: /^Model/ }).fill(model.model);
}

function keyGroup(page: Page) {
  return page.getByRole('group', { name: /^Service account key/ });
}

async function chooseKeyFile(page: Page, key: VertexModel['key']) {
  await page.getByLabel('Service account key file').setInputFiles(
    'file' in key
      ? key.file
      : {
          name: 'key.json',
          mimeType: 'application/json',
          buffer: Buffer.from(key.content),
        },
  );
}

/**
 * Connects the model and opens its page once kagent accepted it. The page
 * reads the ModelConfig on arrival, so it is opened again until the
 * controller's verdict is in.
 */
async function connectVertexModel(page: Page, model: VertexModel) {
  await fillVertexModel(page, model);
  await page.getByRole('button', { name: 'Connect model' }).click();
  await expect(page).toHaveURL(/\/customize\/models$/, { timeout: 60_000 });
  await page
    .getByRole('rowheader', { name: new RegExp(`^${model.displayName}`) })
    .getByRole('link')
    .click();
  const modelPath = new URL(page.url()).pathname;
  await expect
    .poll(
      async () => {
        await open(page, modelPath);
        return page
          .getByRole('main')
          .getByText('Ready', { exact: true })
          .first()
          .isVisible();
      },
      {
        timeout: 90_000,
        intervals: [5_000],
        message: `kagent accepts ${model.displayName}: \`kubectl -n kagent get modelconfigs.api.kagent.dev -o yaml\``,
      },
    )
    .toBe(true);
  return modelPath;
}

async function deleteModelInPortal(page: Page, modelPath: string) {
  await open(page, modelPath);
  await page.getByRole('button', { name: 'Model actions' }).click();
  await page.getByRole('menuitem', { name: /Delete model/ }).click();
  await page
    .getByRole('dialog', { name: /Delete model/ })
    .getByRole('button', { name: 'Delete model' })
    .click();
  await expect(page).toHaveURL(/\/customize\/models$/, { timeout: 60_000 });
}

const vertexStamp = new Date().toISOString().replace(/[-:T]/g, '').slice(4, 12);

test('a Vertex AI model is checked in the form, accepted by kagent, and says the gateway does not meter it', async ({
  admin,
}) => {
  const projectID = 'e2e-project-123';
  const model: VertexModel = {
    provider: 'Claude on Vertex AI',
    displayName: `E2E Vertex ${vertexStamp}`,
    model: 'claude-sonnet-4-5@20250929',
    location: 'global',
    key: { content: fakeServiceAccountKey(projectID) },
  };
  await dismissMcpSignInNotice(admin);

  // kagent's own check, in the form, as soon as a file is chosen.
  await open(admin, '/agent-platform/models/new');
  await admin.getByRole('button', { name: /Provider/ }).click();
  await admin.getByRole('option', { name: model.provider }).click();
  await chooseKeyFile(admin, {
    content: JSON.stringify({ type: 'authorized_user' }),
  });
  await expect(
    admin.getByText('This file is not a service account key.', {
      exact: false,
    }),
  ).toBeVisible();

  const modelPath = await connectVertexModel(admin, model);
  try {
    await expect(
      admin.getByRole('note').filter({ hasText: 'does not meter Vertex AI' }),
    ).toBeVisible();
    await expect(
      admin.getByText(/is not editable here/),
      'the form speaks Vertex AI',
    ).toHaveCount(0);
  } finally {
    await deleteModelInPortal(admin, modelPath);
  }
});

/**
 * A real turn on Vertex AI, through a model connected in the form with a real
 * service account key read from its file. Runs only where the key is given:
 *
 *   VERTEX_SA_KEY_FILE   the JSON key (its project_id is the model's project)
 *   VERTEX_LOCATION      default global
 *   VERTEX_CLAUDE_MODEL  e.g. claude-sonnet-4-5@20250929; unset skips Claude
 *   VERTEX_GEMINI_MODEL  e.g. gemini-2.5-flash; unset skips Gemini
 */
const vertexKeyFile = process.env.VERTEX_SA_KEY_FILE;
const vertexTurns = [
  {
    provider: 'Claude on Vertex AI' as const,
    model: process.env.VERTEX_CLAUDE_MODEL,
    slug: 'claude',
  },
  {
    provider: 'Gemini on Vertex AI' as const,
    model: process.env.VERTEX_GEMINI_MODEL,
    slug: 'gemini',
  },
];

for (const turn of vertexTurns) {
  test(`an agent on ${turn.provider} completes a turn`, async ({ admin }) => {
    test.skip(
      !vertexKeyFile || !turn.model,
      'needs VERTEX_SA_KEY_FILE and the provider’s VERTEX_*_MODEL',
    );
    test.setTimeout(15 * 60_000);

    const displayName = `E2E Vertex ${turn.slug} ${vertexStamp}`;
    const agentName = `E2E Vertex ${turn.slug} agent ${vertexStamp}`;
    const agentSlug = `e2e-vertex-${turn.slug}-agent-${vertexStamp}`;
    const prompt = 'Reply with exactly the single word PONG and nothing else.';

    await dismissMcpSignInNotice(admin);
    const modelPath = await connectVertexModel(admin, {
      provider: turn.provider,
      displayName,
      model: turn.model!,
      location: process.env.VERTEX_LOCATION ?? 'global',
      key: { file: vertexKeyFile! },
    });
    let detailPath: string | undefined;
    try {
      detailPath = await createAgentInWizard(admin, agentName, agentSlug, {
        model: new RegExp(displayName),
      });
      await startSessionOnReadyAgent(admin, prompt);
      await expect(
        admin.getByTestId('timeline-agent-message').filter({ hasText: 'PONG' }),
        `the agent on ${turn.provider} answers`,
      ).toBeVisible({ timeout: 3 * 60_000 });
    } finally {
      if (detailPath) {
        await deleteAgentInPortal(admin, detailPath, agentSlug);
      }
      await deleteModelInPortal(admin, modelPath);
    }
  });
}
