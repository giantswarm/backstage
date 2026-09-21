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
  HUB_PORTAL_FILE,
  installation,
  MIXED,
  NOT_COMPARED,
  NOT_OPTED_IN,
  PLANNED,
  PLANNED_ON_HUB,
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
    expect(screen.getByTestId('choice-modelServing.enabled')).toHaveTextContent(
      'Model serving: off',
    );
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
    expect(header()).toHaveTextContent('Installed · 2 checks differ');
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
      expect(planned.querySelector('summary')).toHaveTextContent(
        'Runtime: 1 check planned',
      );
      expect(planned).not.toHaveAttribute('open');
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
      // The patch, touched by two features, is one group, open: a difference is to apply.
      const patch = fileGroup(PATCH);
      expect(patch).toHaveAttribute('open');
      expect(patch.querySelector('summary')).toHaveTextContent(
        `${PATCH} — 2 values differ · 1 value planned`,
      );
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
      const patch = fileGroup(PATCH);
      expect(patch).not.toHaveAttribute('open');
      expect(patch.querySelector('summary')).toHaveTextContent(
        `${PATCH} — 1 value planned`,
      );
      expect(
        within(rowOfLine(PATCH, 2)).getByTestId('annotation'),
      ).toHaveTextContent('The kagent API moves to v2');
      expect(within(patch).getAllByTestId('annotation')).toHaveLength(1);
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

  describe('the files', () => {
    it('heads each file once and annotates the diff on the changed line', async () => {
      await render(ENABLED);
      const patch = fileGroup(PATCH);
      expect(patch).toHaveAttribute('open');
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
      expect(group).toHaveAttribute('open');
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
      expect(planned.querySelector('summary')).toHaveTextContent(
        'Runtime, Portal section: 2 checks planned',
      );
      const onHub = within(planned).getByTestId(`file-${HUB_PORTAL_FILE}`);
      expect(onHub.querySelector('summary')).toHaveTextContent(
        `${HUB_PORTAL_FILE} on the hub hazel — 2 values planned`,
      );
      expect(fileGroup(PATCH).querySelector('summary')).not.toHaveTextContent(
        'on the hub',
      );
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
      expect(patch.querySelector('summary')).toHaveTextContent(
        `${PATCH} — 1 value differs · 3 values planned`,
      );
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
