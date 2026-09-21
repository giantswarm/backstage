import { renderInTestApp } from '@backstage/frontend-test-utils';
import { TestApiProvider } from '@backstage/test-utils';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  CapabilityState,
  Installation,
  platformCapabilitiesApiRef,
  VerifyResult,
} from '../apis';
import {
  AGENT_PLATFORM_DEFINITION,
  COMMIT_REFUSED,
  ENABLED,
  ENABLED_NOT_OPTED_IN,
  FakeApi,
  FakeOptions,
  installation,
  MIXED,
  NOT_COMPARED,
  NOT_OPTED_IN,
  PLANNED,
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
const MANAGER_WORDS =
  /opt-in|opted in|reconcile|verify|dry run|inputs on record/i;

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

async function render(target: Installation, options: FakeOptions = {}) {
  const api = new FakeApi(options);
  await renderInTestApp(
    <TestApiProvider apis={[[platformCapabilitiesApiRef, api]]}>
      <PlatformCapabilitiesProviders>
        <CapabilityCard
          installation={target}
          capability={target.capabilities[0]}
          definition={AGENT_PLATFORM_DEFINITION}
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

describe('CapabilityCard', () => {
  beforeEach(() => platformCapabilitiesQueryClient.clear());

  it.each<[string, Partial<CapabilityState>, VerifyResult, string]>([
    ['not installed', { state: 'not enabled' }, VERIFIED, 'Not installed'],
    [
      'installed with differences',
      { state: 'enabled', enabled: true },
      VERIFIED,
      'Installed · 2 differences',
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
      'Installed · 2 differences',
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

  it('runs the comparison as it opens and shows one line per fact', async () => {
    const api = await render(ENABLED);
    expect(api.verifies).toEqual([
      { installation: 'birch', capability: 'agent-platform', args: undefined },
    ]);
    // The person's one choice, from the comparison's inputs.
    expect(screen.getByTestId('choice-modelServing.enabled')).toHaveTextContent(
      'Model serving: off',
    );
    // Only the features with differences are listed, closed.
    expect(screen.getByTestId('feature-secrets')).toHaveTextContent(
      'Secrets — 1 difference',
    );
    expect(screen.getByTestId('feature-runtime')).toHaveTextContent(
      'Runtime — 1 difference',
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
    // A feature opens to its differing dimensions.
    await userEvent.click(
      within(screen.getByTestId('feature-runtime')).getByText(/Runtime/),
    );
    expect(
      screen.getByTestId('dimension-patch-top-level-keys'),
    ).toHaveTextContent('kagent.replicas');
    expect(screen.queryByTestId('dimension-live-drift')).toBeNull();
    expect(screen.getByRole('button', { name: 'Apply changes' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Verify' })).toBeNull();
    expect(card().textContent).not.toMatch(MANAGER_WORDS);
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
    expect(
      screen.getByRole('button', { name: 'Apply changes' }),
    ).toBeDisabled();
  });

  it('names the file the owners add, once, with the button disabled', async () => {
    await render(NOT_OPTED_IN);
    expect(header()).toHaveTextContent('Not installed');
    expect(screen.getByRole('button', { name: 'Enable' })).toBeDisabled();
    const note = screen.getByTestId('needs-owners');
    expect(note).toHaveTextContent(
      'Needs example/example-management-clusters: management-clusters/alder/platform-manager.yaml with optIn: true from the owners.',
    );
    expect(within(note).getByRole('link')).toHaveAttribute(
      'href',
      NOT_OPTED_IN.optIn.howToOptIn,
    );
    expect(screen.queryByTestId('opt-in-note')).toBeNull();
    expect(card().textContent).not.toMatch(MANAGER_WORDS);
  });

  it('keeps the owners line alone where the refusal is the opt-in, the button disabled', async () => {
    await render(ENABLED_NOT_OPTED_IN, {
      verified: { ...VERIFIED, commitRefused: 'maple is not opted in' },
    });
    expect(header()).toHaveTextContent('Installed · 2 differences');
    expect(
      screen.getByRole('button', { name: 'Apply changes' }),
    ).toBeDisabled();
    expect(screen.getByTestId('needs-owners')).toHaveTextContent(
      'management-clusters/maple/platform-manager.yaml',
    );
    expect(screen.queryByTestId('commit-refused')).toBeNull();
    expect(screen.getByTestId('comparison')).toBeInTheDocument();
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
      expect(screen.queryByTestId('needs-owners')).toBeNull();
      await userEvent.click(button);
      expect(screen.queryByRole('form')).toBeNull();
      expect(card().textContent).not.toMatch(MANAGER_WORDS);
    },
  );

  it('shows the comparison error and no comparison lines', async () => {
    const forbidden = new Error('no grant on birch as you');
    forbidden.name = 'ForbiddenError';
    await render(ENABLED, { verifyError: forbidden });
    expect(screen.getByText('no grant on birch as you')).toBeVisible();
    expect(header()).toHaveTextContent('Installed');
    expect(screen.queryByTestId('comparison')).toBeNull();
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
    // The review is the comparison computed with what the form holds.
    expect(api.verifies[1]).toMatchObject({
      installation: 'rowan',
      capability: 'agent-platform',
      args: {
        inputs: {
          installation: { baseDomain: 'rowan.example.test', chartLine: '4' },
          modelServing: { enabled: false },
        },
      },
    });
    expect(api.writes).toHaveLength(0);
    expect(within(dialog).getByTestId('feature-runtime')).toHaveTextContent(
      'Runtime — 1 difference',
    );
    expect(within(dialog).getByTestId('plan-files')).toHaveTextContent(
      'configmap-values.yaml.patch — create',
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
        verified: { ...VERIFIED, commitRefused: 'rowan is not opted in' },
      }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Review' }));
    await waitFor(() =>
      expect(screen.getByText('The manager would refuse this')).toBeVisible(),
    );
    expect(screen.getByText('rowan is not opted in')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Open pull requests' }),
    ).toBeNull();
  });

  describe('planned changes and a comparison that did not run', () => {
    const enabled = (verified: VerifyResult) =>
      render(withCapability({ state: 'enabled', enabled: true }), { verified });

    it.each<[string, VerifyResult, string]>([
      ['only planned changes', PLANNED, 'Installed · 1 planned change'],
      [
        'differences and planned changes',
        MIXED,
        'Installed · 3 differences · 1 planned change',
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

    it('collapses the features whose changes are all planned into one line', async () => {
      await enabled(PLANNED);
      expect(screen.getByTestId('planned')).toHaveTextContent(
        'Runtime: planned changes (1)',
      );
      expect(screen.queryByTestId('feature-runtime')).toBeNull();
      expect(screen.getByTestId('as-defined')).toHaveTextContent(
        'Identity, Tool access, Portal section: as defined',
      );
      expect(
        screen.getByRole('button', { name: 'Apply changes' }),
      ).toBeEnabled();
    });

    it('opens a feature with differences to its planned change and its reason', async () => {
      await enabled(MIXED);
      const feature = screen.getByTestId('feature-migrations');
      expect(feature).toHaveTextContent(
        'Migrations — 1 difference · 1 planned change',
      );
      await userEvent.click(within(feature).getByText(/Migrations/));
      const planned = within(feature).getByTestId(
        'dimension-kagent-api-version',
      );
      expect(planned).toHaveTextContent(
        'planned: migrates to kagent API v2 with the 4 chart line',
      );
      expect(planned).not.toHaveTextContent('rendered');
      expect(
        within(feature).getByTestId('dimension-chart-line'),
      ).toHaveTextContent('rendered "4", current "3"');
    });

    it('says why the comparison did not run, first, and lists nothing else', async () => {
      await enabled(NOT_COMPARED);
      const note = screen.getByTestId('not-compared');
      expect(note).toHaveTextContent(
        'The comparison did not run: installation.podCertificateRequest: the record does not say',
      );
      // The first line under the header row.
      expect(card().children[1]).toBe(note);
      expect(screen.queryByTestId('comparison')).toBeNull();
      expect(screen.queryByTestId('as-defined')).toBeNull();
    });

    it('reads Not installed · not compared where the definition refused', async () => {
      await render(withCapability({ state: 'not enabled' }), {
        verified: NOT_COMPARED,
      });
      expect(header()).toHaveTextContent('Not installed · not compared');
      expect(screen.getByRole('button', { name: 'Enable' })).toBeEnabled();
    });

    it('the review shows the refusal alone', async () => {
      await renderDialog(new FakeApi({ verified: NOT_COMPARED }));
      await userEvent.click(screen.getByRole('button', { name: 'Review' }));
      await waitFor(() =>
        expect(screen.getByText('The manager would refuse this')).toBeVisible(),
      );
      expect(screen.getByTestId('refused')).toHaveTextContent(
        'installation.podCertificateRequest',
      );
      expect(screen.queryByTestId('plan')).toBeNull();
      expect(screen.queryByTestId('comparison')).toBeNull();
      expect(screen.queryByText(/every file is as defined/)).toBeNull();
      expect(
        screen.queryByRole('button', { name: 'Open pull requests' }),
      ).toBeNull();
    });
  });

  it('collapses the choices without a value into one line', async () => {
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
              pool: { type: 'string', 'x-source': 'person' },
            },
          },
        },
      },
    };
    const api = new FakeApi();
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
    expect(screen.getByTestId('choice-modelServing.enabled')).toHaveTextContent(
      'Model serving: off',
    );
    expect(screen.queryByTestId('choice-gpu.nodes')).toBeNull();
    expect(screen.getByTestId('choices-unset')).toHaveTextContent(
      '2 choices not on record',
    );
    expect(card().textContent).not.toMatch(/not chosen/);
  });
});
