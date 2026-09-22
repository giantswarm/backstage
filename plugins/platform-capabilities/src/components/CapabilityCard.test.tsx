import { renderInTestApp } from '@backstage/frontend-test-utils';
import { TestApiProvider } from '@backstage/test-utils';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  CapabilityState,
  Definition,
  Installation,
  platformCapabilitiesApiRef,
  VerifyResult,
} from '../apis';
import {
  AGENT_PLATFORM_DEFINITION,
  APP_ID_NOT_ON_RECORD,
  COMMIT_REFUSED,
  CUSTOMER_PORTAL_DEFINITION,
  MISSING_CHOICES,
  ENABLED,
  FakeApi,
  FakeOptions,
  HUB_PORTAL_FILE,
  installation,
  MIXED,
  NOT_COMPARED,
  NOT_ENABLED,
  PLANNED,
  PLANNED_ON_HUB,
  PORTAL_ON_RECORD,
  REFUSED_ACTION,
  REWRITTEN,
  UP_TO_DATE,
  VERIFIED,
} from '../fixtures/fakeApi';
import { CapabilityCard } from './CapabilityCard';
import { CapabilityDialog } from './CapabilityDialog';
import {
  PlatformCapabilitiesProviders,
  platformCapabilitiesQueryClient,
} from './Providers';

jest.mock('./connectBounce', () => ({
  ...jest.requireActual('./connectBounce'),
  bounceToConnect: jest.fn(),
}));

/** The words the page never shows on the tab. */
const MANAGER_WORDS = /reconcile|verify|dry run|inputs on record/i;

/** rowan with the capability in one state. */
function withCapability(
  capability: Partial<CapabilityState>,
  overrides: Partial<Installation> = {},
): Installation {
  return installation({
    capabilities: [
      {
        name: 'agent-platform',
        state: 'not enabled',
        enabled: false,
        lastAction: null,
        ...capability,
      },
    ],
    ...overrides,
  });
}

/** A comparison with a red probe. */
const RED_PROBE: VerifyResult = {
  ...VERIFIED,
  features: [
    {
      id: 'identity',
      title: 'Identity',
      mark: 'drifted',
      dimensions: [
        {
          id: 'dex-auth-request',
          kind: 'probe',
          mark: 'drifted',
          probe: {
            requests: [
              {
                url: 'https://dex.rowan.example.test/auth',
                status: 500,
                ok: false,
              },
            ],
          },
        },
      ],
    },
  ],
  summary: { drifted: 1 },
};

async function render(
  target: Installation,
  options: FakeOptions = {},
  definition: Definition = AGENT_PLATFORM_DEFINITION,
) {
  const api = new FakeApi(options);
  await renderInTestApp(
    <TestApiProvider apis={[[platformCapabilitiesApiRef, api]]}>
      <PlatformCapabilitiesProviders>
        <CapabilityCard
          installation={target}
          capability={target.capabilities[0]}
          definition={definition}
        />
      </PlatformCapabilitiesProviders>
    </TestApiProvider>,
  );
  await waitFor(() => expect(screen.queryByTestId('comparing')).toBeNull());
  return api;
}

/** The dialog alone, for the review's own cases. */
async function renderDialog(api: FakeApi) {
  const target = installation();
  await renderInTestApp(
    <TestApiProvider apis={[[platformCapabilitiesApiRef, api]]}>
      <PlatformCapabilitiesProviders>
        <CapabilityDialog
          kind="enable"
          installation={target}
          capability={target.capabilities[0]}
          definition={AGENT_PLATFORM_DEFINITION}
          isOpen
          onClose={() => undefined}
        />
      </PlatformCapabilitiesProviders>
    </TestApiProvider>,
  );
}

const header = () => screen.getByTestId('capability-state');
const card = () => screen.getByTestId('capability-agent-platform');
/** The status region announcing the comparison's outcome. */
const outcome = () => screen.getByTestId('comparison-outcome');

const PATCH =
  'example/example-configs:installations/rowan/apps/agent-platform/configmap-values.yaml.patch';
const KUSTOMIZATION =
  'example/example-management-clusters:management-clusters/rowan/extras/agent-platform/secrets/kustomization.yaml';

/** The file's group on the tab. */
const fileGroup = (file: string) => screen.getByTestId(`file-${file}`);

/** The diff row of the rendered file's line `n`. */
const rowOfLine = (file: string, n: number) => {
  const row = fileGroup(file).querySelector(`[data-line="${n}"]`);
  expect(row).not.toBeNull();
  return row as HTMLElement;
};

/**
 * The line a group opens from: the accordion's trigger, the group's first
 * button, found inside a closed outer group too.
 */
const trigger = (group: HTMLElement) =>
  within(group).getAllByRole('button', { hidden: true })[0];

/** Opens a group closed until opened. */
const open = (group: HTMLElement) => userEvent.click(trigger(group));

/** A choice's value on the record. */
const choice = (name: string) => screen.getByTestId(`choice-${name}`);

/** The record: the region named On record, its choices a `dl`. */
const record = () => screen.getByRole('region', { name: 'On record' });

describe('CapabilityCard', () => {
  beforeEach(() => platformCapabilitiesQueryClient.clear());

  it.each<[string, Partial<CapabilityState>, VerifyResult, string]>([
    ['not installed', { state: 'not enabled' }, VERIFIED, 'Not installed'],
    [
      'installed with differences',
      { state: 'enabled', enabled: true },
      VERIFIED,
      'Installed · 2 checks differ',
    ],
    [
      'installed, up to date',
      { state: 'enabled', enabled: true },
      UP_TO_DATE,
      'Installed · up to date',
    ],
    [
      'drifted by the last check',
      { state: 'drifted', enabled: true },
      VERIFIED,
      'Installed · 2 checks differ',
    ],
    [
      'enabling, pending approval',
      {
        state: 'pending approval',
        enabled: true,
        lastAction: { name: 'enable-agent-platform-rowan-1' },
      },
      VERIFIED,
      'Enabling · pending approval',
    ],
    [
      'applying, rolling out',
      {
        state: 'rolling out',
        enabled: true,
        lastAction: { name: 'reconcile-agent-platform-rowan-2' },
      },
      VERIFIED,
      'Applying · rolling out',
    ],
    [
      'waiting for the customer',
      { state: 'waiting for the customer', enabled: true },
      VERIFIED,
      'Waiting for the customer: Provide the model API key',
    ],
    [
      'failed',
      { state: 'failed', enabled: true },
      RED_PROBE,
      'Failed: dex-auth-request',
    ],
    ['unknown', { state: 'unknown' }, VERIFIED, 'Unknown'],
  ])(
    'the header of a capability %s',
    async (_, capability, verified, words) => {
      await render(withCapability(capability), { verified });
      expect(header()).toHaveTextContent(words);
      expect(header()).toHaveAttribute('data-state', capability.state!);
    },
  );

  it('marks the header as the Installations page marks the cell, the legend on the tooltip', async () => {
    await render(withCapability({ state: 'enabled', enabled: true }), {
      verified: VERIFIED,
    });
    expect(header()).toHaveAttribute('data-mark', 'not in sync');
    expect(header()).toHaveAttribute(
      'title',
      'not in sync: Installed, with differences',
    );
  });

  it('lays the card out as two labelled regions, the record a definition list', async () => {
    await render(withCapability({ state: 'enabled', enabled: true }), {
      verified: VERIFIED,
    });
    expect(
      within(card())
        .getAllByRole('region')
        .map(region => region.getAttribute('data-testid')),
    ).toEqual(['record', 'compared']);
    expect(record().querySelector('dl')).not.toBeNull();
    expect(
      screen.getByRole('region', { name: 'Compared with the definition' }),
    ).toBeInTheDocument();
    // What the choice is about, from the definition, under its value.
    expect(
      within(record()).getByText(
        'The one choice: whether the installation serves models.',
      ),
    ).toBeInTheDocument();
  });

  it('runs the comparison as it opens and shows one line per fact', async () => {
    const api = await render(ENABLED);
    expect(api.verifies).toEqual([
      {
        installation: 'birch',
        capability: 'agent-platform',
        args: { content: true },
      },
    ]);
    // The person's one choice, from the comparison's inputs.
    expect(choice('modelServing.enabled')).toHaveTextContent('off');
    expect(within(record()).getByText('Model serving')).toBeInTheDocument();
    // Only the features with differences are listed, closed.
    expect(screen.getByTestId('feature-secrets')).toHaveTextContent(
      'Secrets — 1 check differs',
    );
    expect(screen.getByTestId('feature-runtime')).toHaveTextContent(
      'Runtime — 1 check differs',
    );
    expect(screen.queryByTestId('feature-identity')).toBeNull();
    expect(screen.getByTestId('as-defined')).toHaveTextContent(
      'Identity, Tool access, Portal section: as defined',
    );
    expect(screen.getByTestId('needs-session')).toHaveTextContent(
      '2 checks need your session on birch',
    );
    expect(screen.getByTestId('not-run')).toHaveTextContent(
      '1 check could not run: renders no file of this kind',
    );
    // The dimensions say nothing the files do not.
    expect(screen.queryByTestId('dimension-facts')).toBeNull();
    expect(screen.queryByTestId('dimension-live-drift')).toBeNull();
    expect(screen.getByRole('button', { name: 'Apply changes' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Verify' })).toBeNull();
    expect(card().textContent).not.toMatch(MANAGER_WORDS);
  });

  it('names the checks that did not run and runs those needing the session as the viewer', async () => {
    const api = await render(ENABLED);
    const session = screen.getByTestId('needs-session');
    expect(session).toHaveTextContent('2 checks need your session on birch');
    expect(
      within(session).getByTestId('check-live-dex-auth-per-client'),
    ).toHaveTextContent('live-dex-auth-per-client');
    expect(within(session).getByTestId('check-live-drift')).toHaveTextContent(
      'live-drift',
    );
    const notRun = screen.getByTestId('not-run');
    expect(notRun).toHaveTextContent(
      '1 check could not run: renders no file of this kind',
    );
    expect(
      within(notRun).getByTestId('check-federation-targets'),
    ).toHaveTextContent('federation-targets');

    await userEvent.click(
      screen.getByRole('button', { name: 'Run them as you' }),
    );
    await waitFor(() =>
      expect(screen.queryByTestId('needs-session')).toBeNull(),
    );
    // The live half ran as the person from the comparison's own inputs.
    expect(api.liveVerifies).toEqual([
      {
        installation: 'birch',
        capability: 'agent-platform',
        args: { inputs: VERIFIED.inputs },
      },
    ]);
    // Its word on the live dimensions joins the comparison: the drift it
    // found shows under its feature with the object and the check.
    expect(screen.getByTestId('feature-runtime')).toHaveTextContent(
      'Runtime — 2 checks differ',
    );
    expect(screen.getByTestId('dimension-live-drift')).toHaveTextContent(
      'HelmRelease flux-giantswarm/agent-platform',
    );
    expect(screen.getByTestId('checks-live-drift')).toHaveTextContent(
      '1 difference(s)',
    );
    expect(screen.getByTestId('not-run')).toHaveTextContent(
      '1 check could not run',
    );
    expect(card().textContent).not.toMatch(MANAGER_WORDS);
  });

  it('shows why the live checks did not run and keeps the checks listed', async () => {
    await render(ENABLED, {
      liveError: new Error('forbidden for you: pods is forbidden'),
    });
    await userEvent.click(
      screen.getByRole('button', { name: 'Run them as you' }),
    );
    await waitFor(() =>
      expect(
        screen.getByText('forbidden for you: pods is forbidden'),
      ).toBeVisible(),
    );
    expect(screen.getByTestId('needs-session')).toHaveTextContent(
      '2 checks need your session on birch',
    );
  });

  it('has no button when up to date, and a disabled one while an action runs', async () => {
    await render(ENABLED, { verified: UP_TO_DATE });
    expect(
      screen.queryByRole('button', { name: /Enable|Apply changes/ }),
    ).toBeNull();
    expect(screen.queryByTestId('feature-identity')).toBeNull();

    platformCapabilitiesQueryClient.clear();
    await render(
      withCapability({
        state: 'rolling out',
        enabled: true,
        lastAction: { name: 'enable-agent-platform-rowan-1' },
      }),
    );
    const button = screen.getByRole('button', { name: 'Apply changes' });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription('Enabling · rolling out');
  });

  it('gives every row of the record a label of its own where two leaves share a name', async () => {
    // wallaby-like: the portal's domain is on record and the manager lists
    // the grafana plugin's domain, a leaf it reads itself, as not on record.
    const portal = installation({
      capabilities: [
        {
          name: 'customer-portal',
          state: 'enabled',
          enabled: true,
          lastAction: null,
        },
      ],
    });
    await render(
      portal,
      {
        verified: {
          ...PORTAL_ON_RECORD,
          inputs: {
            ...PORTAL_ON_RECORD.inputs!,
            unset: ['tunnel.enabled', 'plugins.grafana.domain'],
          },
        },
      },
      CUSTOMER_PORTAL_DEFINITION,
    );
    const terms = within(screen.getByRole('region', { name: 'On record' }))
      .getAllByRole('term')
      .map(term => term.textContent);
    expect(terms).toEqual(
      expect.arrayContaining(['Portal domain', 'Grafana domain', 'Tunnel']),
    );
    expect(terms).not.toContain('Domain');
    expect(new Set(terms).size).toBe(terms.length);
  });

  it("counts the endpoints that did not answer on one line, the requests' errors behind it", async () => {
    const dex =
      'unreachable from the manager: Get "https://dex.birch.example.test/.well-known/openid-configuration": context deadline exceeded';
    const grafana =
      'unreachable from the manager: Get "https://grafana.birch.example.test/api/health": dial tcp: i/o timeout';
    const probe = (id: string, reason: string) => ({
      id,
      kind: 'probe' as const,
      mark: 'not checked' as const,
      reason,
    });
    await render(ENABLED, {
      verified: {
        ...VERIFIED,
        features: [
          ...VERIFIED.features,
          {
            id: 'endpoints',
            title: 'Endpoints',
            mark: 'not checked',
            dimensions: [
              probe('dex-openid', dex),
              probe('dex-auth', dex),
              probe('grafana-health', grafana),
            ],
          },
        ],
      },
    });
    const unreachable = screen.getByTestId('unreachable');
    // The line the checks open from counts the endpoints, no Go error on it.
    expect(within(unreachable).getByRole('button')).toHaveTextContent(
      /^2 endpoints did not answer$/,
    );
    const endpoints = within(unreachable).getAllByTestId('endpoint');
    expect(endpoints).toHaveLength(2);
    expect(endpoints[0]).toHaveTextContent(dex);
    expect(
      Array.from(endpoints[0].querySelectorAll('li')).map(li => li.textContent),
    ).toEqual(['dex-openid', 'dex-auth']);
    expect(endpoints[1]).toHaveTextContent(grafana);
    // The other reasons keep their own lines.
    expect(screen.getByTestId('not-run')).toHaveTextContent(
      '1 check could not run: renders no file of this kind',
    );
    expect(card().textContent).not.toMatch(MANAGER_WORDS);
  });

  it('offers Enable where nothing is on record, with no line under it', async () => {
    await render(NOT_ENABLED);
    expect(header()).toHaveTextContent('Not installed');
    expect(screen.getByRole('button', { name: 'Enable' })).toBeEnabled();
    expect(screen.queryByTestId('commit-refused')).toBeNull();
    expect(card().textContent).not.toMatch(MANAGER_WORDS);
  });

  it.each<[string, Installation, string]>([
    ['installed', ENABLED, 'Apply changes'],
    ['not installed', installation(), 'Enable'],
  ])(
    'disables the button and says why where the manager would refuse the commit, %s',
    async (_, target, name) => {
      await render(target, { verified: COMMIT_REFUSED });
      const button = screen.getByRole('button', { name });
      expect(button).toBeDisabled();
      expect(screen.getByTestId('commit-refused')).toHaveTextContent(
        COMMIT_REFUSED.commitRefused!,
      );
      // The reason under the button is the button's accessible description.
      expect(button).toHaveAccessibleDescription(COMMIT_REFUSED.commitRefused!);
      await userEvent.click(button);
      expect(screen.queryByRole('form')).toBeNull();
      expect(card().textContent).not.toMatch(MANAGER_WORDS);
    },
  );

  it('keeps Enable clickable where the manager refuses only the choices not on record, and names them', async () => {
    await render(installation(), { verified: MISSING_CHOICES });
    const button = screen.getByRole('button', { name: 'Enable' });
    expect(button).toBeEnabled();
    expect(screen.getByTestId('commit-refused')).toHaveTextContent(
      MISSING_CHOICES.commitRefused!,
    );
    await userEvent.click(button);
    expect(
      screen.getByRole('form', { name: 'Enable agent-platform on rowan' }),
    ).toBeVisible();
    expect(card().textContent).not.toMatch(MANAGER_WORDS);
  });

  it('shows the comparison error first under the header, and no record without a comparison', async () => {
    const forbidden = new Error('no grant on birch as you');
    forbidden.name = 'ForbiddenError';
    await render(ENABLED, { verifyError: forbidden });
    expect(screen.getByText('no grant on birch as you')).toBeVisible();
    expect(header()).toHaveTextContent(/^Installed$/);
    // The first thing under the header row; the record is the comparison's,
    // so no choice is shown from the schema's default in its place.
    const children = Array.from(card().children);
    expect(children[1]).toHaveTextContent('no grant on birch as you');
    expect(screen.queryByTestId('choice-modelServing.enabled')).toBeNull();
    expect(screen.queryByTestId('comparison')).toBeNull();
    expect(screen.queryByTestId('comparing')).toBeNull();
    // The status region says the comparison did not run.
    expect(outcome()).toHaveTextContent(
      'agent-platform: the comparison did not run',
    );
  });

  it('reads a refusal for an input the dialog supplies as info and keeps the way to the dialog', async () => {
    const portal = installation({
      capabilities: [
        {
          name: 'customer-portal',
          state: 'enabled',
          enabled: true,
          lastAction: null,
        },
      ],
    });
    await render(
      portal,
      { verified: APP_ID_NOT_ON_RECORD },
      CUSTOMER_PORTAL_DEFINITION,
    );
    const alert = within(
      screen.getByTestId('capability-customer-portal'),
    ).getByTestId('refused');
    expect(alert).toHaveAttribute('data-status', 'info');
    expect(alert).toHaveTextContent(
      "the GitHub App's id (plugins.github.appId) is not on record; supply it under Apply changes",
    );
    expect(header()).toHaveTextContent('Installed · not compared');
    expect(screen.queryByTestId('commit-refused')).toBeNull();
    const button = screen.getByRole('button', { name: 'Apply changes' });
    expect(button).toBeEnabled();
    await userEvent.click(button);
    expect(
      screen.getByRole('form', {
        name: 'Apply changes to customer-portal on rowan',
      }),
    ).toBeVisible();
  });

  it('Enable reviews the comparison with the form values, then opens the pull requests', async () => {
    const api = await render(installation());
    await userEvent.click(screen.getByRole('button', { name: 'Enable' }));
    const dialog = screen.getByRole('form', {
      name: 'Enable agent-platform on rowan',
    });
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Review' }),
    );
    await waitFor(() =>
      expect(within(dialog).getByTestId('plan')).toBeInTheDocument(),
    );
    // The review is the comparison computed with what the form holds: the
    // person's choices from the card's comparison, nothing of the record.
    expect(api.verifies[1]).toMatchObject({
      installation: 'rowan',
      capability: 'agent-platform',
      args: {
        inputs: {
          kagent: { enabled: true },
          modelServing: { enabled: false },
        },
      },
    });
    expect(api.verifies[1].args?.inputs).not.toHaveProperty('installation');
    expect(api.writes).toHaveLength(0);
    expect(within(dialog).getByTestId('feature-runtime')).toHaveTextContent(
      'Runtime — 1 check differs',
    );
    expect(within(dialog).getByTestId('plan-files')).toHaveTextContent(
      'configmap-values.yaml.patch — update',
    );
    expect(within(dialog).getByTestId('plan-pull-requests')).toHaveTextContent(
      'example/example-configs — 1 change(s)',
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Open pull requests' }),
    );
    await waitFor(() =>
      expect(within(dialog).getByTestId('committed')).toBeInTheDocument(),
    );
    expect(api.writes).toEqual([
      expect.objectContaining({
        tool: 'enable_capability',
        installation: 'rowan',
        options: { mode: 'commit' },
        args: {
          inputs: expect.objectContaining({ modelServing: { enabled: false } }),
        },
      }),
    ]);
  });

  it('Apply changes reviews, then reconciles', async () => {
    const api = await render(ENABLED);
    await userEvent.click(
      screen.getByRole('button', { name: 'Apply changes' }),
    );
    const dialog = screen.getByRole('form', {
      name: 'Apply changes to agent-platform on birch',
    });
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Review' }),
    );
    await waitFor(() =>
      expect(within(dialog).getByTestId('plan')).toBeInTheDocument(),
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Open pull requests' }),
    );
    await waitFor(() => expect(api.writes).toHaveLength(1));
    expect(api.writes[0]).toMatchObject({
      tool: 'reconcile_capability',
      installation: 'birch',
      options: { mode: 'commit' },
    });
  });

  it('the dialog has nothing to open when the review finds every file as defined', async () => {
    await renderDialog(new FakeApi({ verified: UP_TO_DATE }));
    await userEvent.click(screen.getByRole('button', { name: 'Review' }));
    await waitFor(() =>
      expect(screen.getByTestId('plan-pull-requests')).toHaveTextContent(
        'No pull request: every file is as defined.',
      ),
    );
    expect(
      screen.queryByRole('button', { name: 'Open pull requests' }),
    ).toBeNull();
  });

  it('shows why the manager would refuse, without a commit button', async () => {
    await renderDialog(
      new FakeApi({
        verified: {
          ...VERIFIED,
          commitRefused: 'dex-app 2.2.3 on record: pin 3.2.2 first',
        },
      }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Review' }));
    await waitFor(() =>
      expect(screen.getByText('The manager would refuse this')).toBeVisible(),
    );
    expect(
      screen.getByText('dex-app 2.2.3 on record: pin 3.2.2 first'),
    ).toBeVisible();
    expect(screen.getByTestId('refused')).toHaveAttribute(
      'data-status',
      'warning',
    );
    expect(
      screen.queryByRole('button', { name: 'Open pull requests' }),
    ).toBeNull();
  });

  describe('planned changes and a comparison that did not run', () => {
    const enabled = (verified: VerifyResult) =>
      render(withCapability({ state: 'enabled', enabled: true }), { verified });

    it.each<[string, VerifyResult, string]>([
      ['only planned changes', PLANNED, 'Installed · 1 check planned'],
      [
        'differences and planned changes',
        MIXED,
        'Installed · 3 checks differ · 1 check planned',
      ],
      ['the definition refused', NOT_COMPARED, 'Installed · not compared'],
      [
        'nothing checked',
        { ...NOT_COMPARED, refused: undefined },
        'Installed · not compared',
      ],
    ])('the header with %s', async (_, verified, words) => {
      await enabled(verified);
      expect(header()).toHaveTextContent(words);
    });

    it('collapses the features whose changes are all planned into one line that opens to their files', async () => {
      await enabled(PLANNED);
      const planned = screen.getByTestId('planned');
      expect(trigger(planned)).toHaveTextContent('Runtime: 1 check planned');
      expect(trigger(planned)).toHaveAttribute('aria-expanded', 'false');
      // Every planned change is reachable: the file's group is inside the line.
      expect(within(planned).getByTestId(`file-${PATCH}`)).toBeInTheDocument();
      expect(screen.queryByTestId('feature-runtime')).toBeNull();
      expect(screen.getByTestId('as-defined')).toHaveTextContent(
        'Identity, Tool access, Portal section: as defined',
      );
      expect(
        screen.getByRole('button', { name: 'Apply changes' }),
      ).toBeEnabled();
    });

    it('shows one diff per file with every reason on its line', async () => {
      await enabled(MIXED);
      expect(screen.getByTestId('feature-migrations')).toHaveTextContent(
        'Migrations — 1 check differs · 1 check planned',
      );
      // The patch, touched by two features, is one group, closed until
      // opened whatever it holds: its line says what is in it.
      const patch = fileGroup(PATCH);
      expect(trigger(patch)).toHaveTextContent(
        `${PATCH} — 2 values differ · 1 value planned`,
      );
      expect(trigger(patch)).toHaveAttribute('aria-expanded', 'false');
      await open(patch);
      expect(within(patch).getAllByTestId('diff')).toHaveLength(1);
      const planned = within(rowOfLine(PATCH, 2)).getByTestId('annotation');
      expect(planned).toHaveTextContent(
        'kagent.apiVersion The kagent API moves to v2 with the 4 chart line; the migration rewrites the patch. · M3',
      );
      expect(planned).not.toHaveTextContent(/planned|rendered/);
      expect(
        within(rowOfLine(PATCH, 9)).getByTestId('annotation'),
      ).toHaveTextContent('chartLine drifted');
    });

    it('keeps a group closed while every change in it is planned', async () => {
      await enabled(PLANNED);
      await open(screen.getByTestId('planned'));
      const patch = fileGroup(PATCH);
      expect(trigger(patch)).toHaveAttribute('aria-expanded', 'false');
      expect(trigger(patch)).toHaveTextContent(`${PATCH} — 1 value planned`);
      await open(patch);
      expect(
        within(rowOfLine(PATCH, 2)).getByTestId('annotation'),
      ).toHaveTextContent('The kagent API moves to v2');
      expect(within(patch).getAllByTestId('annotation')).toHaveLength(1);
    });

    it('leads with the refusal as one warning Alert carrying the reason, and lists nothing else', async () => {
      await enabled(NOT_COMPARED);
      const alert = screen.getByTestId('refused');
      expect(alert).toHaveTextContent(NOT_COMPARED.refused!);
      expect(alert).toHaveAttribute('data-status', 'warning');
      // The reason alone: the header already says not compared.
      expect(alert).not.toHaveTextContent(/did not run|not compared/);
      // The first thing in the card's body, under the header row; the
      // commit's copy of the reason is not a second line.
      const [, body] = card().children;
      expect(body.querySelector('[data-testid]')).toBe(alert);
      expect(screen.queryByTestId('commit-refused')).toBeNull();
      expect(
        screen.getByRole('button', { name: 'Apply changes' }),
      ).toBeDisabled();
      expect(screen.queryByTestId('comparison')).toBeNull();
      expect(screen.queryByTestId('as-defined')).toBeNull();
      expect(card().textContent).not.toMatch(MANAGER_WORDS);
    });

    it('reads Not installed · not compared where the definition refused, the button waiting on the fix', async () => {
      await render(withCapability({ state: 'not enabled' }), {
        verified: NOT_COMPARED,
      });
      expect(header()).toHaveTextContent('Not installed · not compared');
      expect(screen.getByRole('button', { name: 'Enable' })).toBeDisabled();
    });

    it('the review shows the refusal over the form kept editable, without a commit button', async () => {
      await renderDialog(new FakeApi({ verified: NOT_COMPARED }));
      await userEvent.click(screen.getByRole('button', { name: 'Review' }));
      await waitFor(() =>
        expect(screen.getByText('The manager would refuse this')).toBeVisible(),
      );
      const alert = screen.getByTestId('refused');
      expect(alert).toHaveTextContent('installation.chartLine');
      expect(alert).toHaveAttribute('data-status', 'warning');
      // A fact of the record is no field of the form: nothing is led to.
      expect(within(alert).queryByRole('button')).toBeNull();
      expect(screen.getByTestId('group-root')).toBeVisible();
      expect(screen.getByRole('button', { name: 'Review' })).toBeEnabled();
      expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
      expect(screen.queryByTestId('plan')).toBeNull();
      expect(screen.queryByTestId('comparison')).toBeNull();
      expect(screen.queryByText(/every file is as defined/)).toBeNull();
      expect(
        screen.queryByRole('button', { name: 'Open pull requests' }),
      ).toBeNull();
    });
  });

  describe('the files', () => {
    it('heads each file once and annotates the diff on the changed line', async () => {
      await render(ENABLED);
      const patch = fileGroup(PATCH);
      await open(patch);
      expect(
        within(screen.getByTestId('comparison')).getAllByText(PATCH),
      ).toHaveLength(1);
      // The record's line 3 removed, the render's line 3 added and annotated.
      const removed = patch.querySelector('[data-current-line="3"]')!;
      expect(removed).toHaveAttribute('data-kind', 'removed');
      expect(removed).toHaveTextContent('replicas: 2');
      expect(
        within(removed as HTMLElement).queryByTestId('annotation'),
      ).toBeNull();
      const added = rowOfLine(PATCH, 3);
      expect(added).toHaveAttribute('data-kind', 'added');
      expect(added).toHaveTextContent('replicas: 1');
      expect(within(added).getByTestId('annotation')).toHaveTextContent(
        'kagent.replicas drifted',
      );
      // The unchanged tail of the file is folded.
      expect(within(patch).getByText('… 4 unchanged lines')).toBeVisible();
      expect(card().textContent).not.toMatch(MANAGER_WORDS);
    });

    it('lists the differences of a file without content, without its name', async () => {
      await render(ENABLED);
      const group = fileGroup(KUSTOMIZATION);
      await open(group);
      expect(within(group).queryByTestId('diff')).toBeNull();
      const [line] = within(group).getAllByRole('listitem');
      expect(line).toHaveTextContent(
        'resources: rendered ["a.yaml"], current ["a.yaml","b.yaml"] — differs by input: installation.private',
      );
      expect(line).not.toHaveTextContent('example-management-clusters');
      expect(
        within(screen.getByTestId('comparison')).getAllByText(KUSTOMIZATION),
      ).toHaveLength(1);
    });

    it('names the hub a file is on, inside the planned line', async () => {
      await render(withCapability({ state: 'enabled', enabled: true }), {
        verified: PLANNED_ON_HUB,
      });
      const planned = screen.getByTestId('planned');
      expect(trigger(planned)).toHaveTextContent(
        'Runtime, Portal section: 2 checks planned',
      );
      const onHub = within(planned).getByTestId(`file-${HUB_PORTAL_FILE}`);
      expect(trigger(onHub)).toHaveTextContent(
        `${HUB_PORTAL_FILE} on the hub hazel — 2 values planned`,
      );
      expect(trigger(fileGroup(PATCH))).not.toHaveTextContent('on the hub');
    });

    it('reads a rewrite as one removal then one addition, the comments folded, the indentation aligned', async () => {
      await render(withCapability({ state: 'enabled', enabled: true }), {
        verified: REWRITTEN,
      });
      expect(header()).toHaveTextContent(
        'Installed · 1 check differs · 1 check planned',
      );
      expect(screen.getByTestId('feature-runtime')).toHaveTextContent(
        'Runtime — 1 check differs · 1 check planned',
      );
      const patch = fileGroup(PATCH);
      expect(trigger(patch)).toHaveTextContent(
        `${PATCH} — 1 value differs · 3 values planned`,
      );
      await open(patch);
      expect(within(patch).getByTestId('reindented')).toHaveTextContent(
        "the record's 4-space indentation shown as 2 spaces",
      );
      // The record's head (its comments, the gateway block) goes, then the
      // render's head (its header, the components) comes: no `enabled: true`
      // aligned across them.
      const kinds = [
        ...patch.querySelectorAll('[data-testid="diff-line"]'),
      ].map(row => row.getAttribute('data-kind'));
      expect(kinds.slice(0, 13)).toEqual([
        ...Array(7).fill('removed'),
        ...Array(6).fill('added'),
      ]);
      expect(kinds.slice(13)).toEqual([
        'context',
        'removed',
        'added',
        'context',
        'removed',
        'removed',
        'context',
      ]);
      // The gateway's leaf removed with its reason, the components' added with theirs, the replicas drifted.
      const gateway = patch.querySelector(
        '[data-current-line="5"]',
      ) as HTMLElement;
      expect(gateway).toHaveAttribute('data-kind', 'removed');
      expect(within(gateway).getByTestId('annotation')).toHaveTextContent(
        'gateway.jwksEgress.enabled Removed: gateway.jwksEgress is the shared default here · M8',
      );
      expect(
        within(rowOfLine(PATCH, 4)).getByTestId('annotation'),
      ).toHaveTextContent('components.kagent.enabled Added:');
      expect(
        within(rowOfLine(PATCH, 8)).getByTestId('annotation'),
      ).toHaveTextContent('kagent.replicas drifted');
      // The record's comments in the routing block fold behind one line, closed.
      const fold = within(patch).getByTestId('fold-comments');
      expect(fold).not.toHaveAttribute('open');
      expect(fold.querySelector('summary')).toHaveTextContent(
        '… 2 comment lines removed',
      );
      expect(within(fold).getAllByTestId('diff-line')).toHaveLength(2);
      expect(card().textContent).not.toMatch(MANAGER_WORDS);
    });
  });

  it('names the choices without a value on one line, as the manager names them', async () => {
    const schema = AGENT_PLATFORM_DEFINITION.inputSchema!;
    const definition = {
      ...AGENT_PLATFORM_DEFINITION,
      inputSchema: {
        ...schema,
        properties: {
          ...schema.properties,
          gpu: {
            type: 'object',
            properties: {
              nodes: { type: 'number', 'x-source': 'person' },
              domain: { type: 'string', 'x-source': 'person' },
            },
          },
          grafana: {
            type: 'object',
            properties: {
              domain: { type: 'string', 'x-source': 'person' },
            },
          },
        },
      },
    };
    // The manager names the choices not on record: two that share a label
    // are told apart by their group, one the schema does not know is named
    // by its key.
    const api = new FakeApi({
      verified: {
        ...VERIFIED,
        inputs: {
          ...VERIFIED.inputs!,
          unset: ['gpu.nodes', 'gpu.domain', 'grafana.domain', 'tunnel.mode'],
        },
      },
    });
    await renderInTestApp(
      <TestApiProvider apis={[[platformCapabilitiesApiRef, api]]}>
        <PlatformCapabilitiesProviders>
          <CapabilityCard
            installation={ENABLED}
            capability={ENABLED.capabilities[0]}
            definition={definition}
          />
        </PlatformCapabilitiesProviders>
      </TestApiProvider>,
    );
    await waitFor(() => expect(screen.queryByTestId('comparing')).toBeNull());
    expect(choice('modelServing.enabled')).toHaveTextContent('off');
    expect(within(record()).getByText('Model serving')).toBeInTheDocument();
    // The choices the record lacks, marked in place under their labels.
    expect(choice('gpu.nodes')).toHaveTextContent('not on record');
    const terms = within(record())
      .getAllByRole('term')
      .map(term => term.textContent);
    expect(terms).toHaveLength(6);
    expect(terms).toEqual(
      expect.arrayContaining([
        'Kagent',
        'Model serving',
        'Nodes',
        'Gpu domain',
        'Grafana domain',
        'Mode',
      ]),
    );
    expect(card().textContent).not.toMatch(/not chosen/);
  });

  it('shows the chosen values alone while the manager names no choice as not on record', async () => {
    const api = new FakeApi();
    await renderInTestApp(
      <TestApiProvider apis={[[platformCapabilitiesApiRef, api]]}>
        <PlatformCapabilitiesProviders>
          <CapabilityCard
            installation={ENABLED}
            capability={ENABLED.capabilities[0]}
            definition={AGENT_PLATFORM_DEFINITION}
          />
        </PlatformCapabilitiesProviders>
      </TestApiProvider>,
    );
    await waitFor(() => expect(screen.queryByTestId('comparing')).toBeNull());
    expect(choice('modelServing.enabled')).toHaveTextContent('off');
    expect(within(record()).getByText('Model serving')).toBeInTheDocument();
    expect(record().textContent).not.toMatch(/not on record/);
  });

  describe('while the comparison runs', () => {
    async function renderHeld() {
      const api = new FakeApi({ heldComparison: true });
      await renderInTestApp(
        <TestApiProvider apis={[[platformCapabilitiesApiRef, api]]}>
          <PlatformCapabilitiesProviders>
            <CapabilityCard
              installation={ENABLED}
              capability={ENABLED.capabilities[0]}
              definition={AGENT_PLATFORM_DEFINITION}
            />
          </PlatformCapabilitiesProviders>
        </TestApiProvider>,
      );
      return api;
    }

    /** The comparison lands. */
    async function settle(api: FakeApi) {
      api.settleComparisons();
      await waitFor(() => expect(screen.queryByTestId('comparing')).toBeNull());
    }

    const refreshButton = () =>
      screen.getByRole('button', { name: 'Refresh comparison' });

    it('in flight: the header and the indicator alone; settled: the record once, complete', async () => {
      const api = await renderHeld();
      // The phase alone in the header, the bar with its label under it, and
      // nothing the comparison could change: no choice from the schema's
      // default, no feature; both buttons wait.
      expect(header()).toHaveTextContent(/^Installed$/);
      const comparing = screen.getByTestId('comparing');
      expect(
        await within(comparing).findByRole('progressbar', {
          name: 'Comparing with the definition…',
        }),
      ).toBeInTheDocument();
      expect(screen.queryByTestId('choice-modelServing.enabled')).toBeNull();
      expect(screen.queryByTestId('comparison')).toBeNull();
      const button = screen.getByRole('button', { name: 'Apply changes' });
      expect(button).toBeDisabled();
      expect(button).toHaveAccessibleDescription(
        'Comparing with the definition…',
      );
      expect(refreshButton()).toBeDisabled();
      expect(refreshButton()).toHaveTextContent('Refresh');
      // Nothing to announce yet.
      expect(outcome()).toBeEmptyDOMElement();

      await settle(api);
      expect(header()).toHaveTextContent('Installed · 2 checks differ');
      // The outcome, announced by the card's one status region.
      expect(screen.getByRole('status')).toBe(outcome());
      expect(outcome()).toHaveTextContent(
        'agent-platform compared: Installed · 2 checks differ',
      );
      expect(choice('modelServing.enabled')).toHaveTextContent('off');
      expect(screen.getByTestId('comparison')).toBeInTheDocument();
      expect(screen.queryByRole('progressbar')).toBeNull();
      expect(
        screen.getByRole('button', { name: 'Apply changes' }),
      ).toBeEnabled();
      expect(refreshButton()).toBeEnabled();
      expect(api.verifies).toHaveLength(1);
      expect(card().textContent).not.toMatch(MANAGER_WORDS);
    });

    it('Refresh runs the comparison again without a reload, the indicator in place of the record until it lands', async () => {
      const api = await renderHeld();
      await settle(api);

      await userEvent.click(refreshButton());
      await waitFor(() => expect(api.verifies).toHaveLength(2));
      expect(api.verifies[1]).toEqual({
        installation: 'birch',
        capability: 'agent-platform',
        args: { content: true },
      });
      // The card is as it was before the first comparison landed.
      expect(screen.getByTestId('comparing')).toBeInTheDocument();
      expect(screen.queryByTestId('choice-modelServing.enabled')).toBeNull();
      expect(screen.queryByTestId('comparison')).toBeNull();
      expect(header()).toHaveTextContent(/^Installed$/);
      expect(refreshButton()).toBeDisabled();
      // The region empties, so the outcome is announced again as it lands.
      expect(outcome()).toBeEmptyDOMElement();

      await settle(api);
      expect(header()).toHaveTextContent('Installed · 2 checks differ');
      expect(choice('modelServing.enabled')).toHaveTextContent('off');
      expect(screen.getByTestId('comparison')).toBeInTheDocument();
      expect(refreshButton()).toBeEnabled();
      expect(outcome()).toHaveTextContent(
        'agent-platform compared: Installed · 2 checks differ',
      );
    });
  });

  describe('the last action', () => {
    it('names it with its own state and when it was asked', async () => {
      await render(
        withCapability({
          lastAction: { name: REFUSED_ACTION.name, result: 'refused' },
        }),
        { actions: [REFUSED_ACTION] },
      );
      const line = screen.getByTestId('last-action');
      await waitFor(() => expect(line).toHaveTextContent(/ago$/));
      expect(line).toHaveTextContent(
        /^Last action: enable agent-platform · Refused · .+ ago$/,
      );
      expect(within(line).getByTestId('action-state')).toHaveAttribute(
        'data-state',
        'refused',
      );
    });

    it('says so when there is none', async () => {
      await render(withCapability({ lastAction: null }));
      expect(screen.getByTestId('last-action')).toHaveTextContent(
        'No action yet',
      );
    });
  });
});
