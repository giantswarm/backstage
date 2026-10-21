import { useEffect } from 'react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Harness } from '@giantswarm/backstage-plugin-kubernetes-react';

import { NewAgentFormProvider, useNewAgentForm } from '../NewAgentFormProvider';
import { HarnessPicker } from './HarnessPicker';

const mockUseResources = jest.fn();
jest.mock('@giantswarm/backstage-plugin-kubernetes-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-kubernetes-react'),
  useResources: (...args: unknown[]) => mockUseResources(...args),
}));

jest.mock('../../hooks/useAgentManager', () => ({
  useAgentManagerInfo: () => ({
    info: {
      harness: { name: 'kagent' },
      namespaces: { default: 'kagent', managed: ['kagent', 'org-acme'] },
    },
    isLoading: false,
    error: null,
  }),
}));

function harness(
  name: string,
  runtime: 'kagent' | 'claude' | 'codex',
  { namespace = 'kagent', displayName = undefined as string | undefined } = {},
): Harness {
  return new Harness(
    {
      apiVersion: 'api.kagent.dev/v1alpha3',
      kind: 'Harness',
      metadata: {
        name,
        namespace,
        ...(displayName && {
          annotations: { 'ui.giantswarm.io/display-name': displayName },
        }),
      },
      spec: {
        [runtime]: {},
        workload: { image: `registry.example/${name}-harness@sha256:0123` },
      },
    } as never,
    'gazelle',
  );
}

let formHarness: string | undefined;
/**
 * The tenant the wizard creates in; unset, it never learns one. Set, the model
 * stays the platform's one, as the wizard keeps it when the tenant and the
 * preselected model land in one render (giantswarm/backstage#3189).
 */
let probeTenant: string | undefined;

function Probe() {
  const { state, setInstallation, setTenantChoices, selectModelConfig } =
    useNewAgentForm();
  useEffect(() => {
    setInstallation('gazelle');
    if (probeTenant) {
      setTenantChoices([probeTenant]);
    }
    selectModelConfig('opus', 'kagent');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  formHarness = state.harness?.name;
  return (
    <button type="button" onClick={() => selectModelConfig('sonnet', 'demo')}>
      Pick a model in demo
    </button>
  );
}

function listing(
  resources: Harness[],
  errors: unknown[] = [],
  isLoading = false,
) {
  return { resources, isLoading, errors };
}

async function render() {
  await renderInTestApp(
    <NewAgentFormProvider>
      <Probe />
      <HarnessPicker />
    </NewAgentFormProvider>,
  );
}

/**
 * The Harnesses each namespace lists for the person: a namespace missing from
 * `readable` refuses the read (403).
 */
function listingByNamespace(readable: Record<string, Harness[]>) {
  mockUseResources.mockImplementation(
    (
      _installations,
      _resource,
      options: Record<string, { namespace: string }>,
    ) => {
      const namespace = options.gazelle?.namespace;
      return namespace && readable[namespace]
        ? listing(readable[namespace])
        : listing([], [{ cluster: 'gazelle', error: new Error('Forbidden') }]);
    },
  );
}

beforeEach(() => {
  formHarness = undefined;
  probeTenant = undefined;
  mockUseResources.mockReset();
});

describe('HarnessPicker', () => {
  it('shows the only Harness of the namespace read-only, with nothing to pick', async () => {
    mockUseResources.mockReturnValue(listing([harness('kagent', 'kagent')]));
    await render();

    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    const card = screen.getByRole('listitem');
    expect(card).toHaveTextContent('Declarative (Go ADK)');
    expect(card).toHaveTextContent('Platform default');
    expect(card).toHaveTextContent('Harness kagent');
    expect(
      screen.getByText('The only Harness in kagent on gazelle runs the agent.'),
    ).toBeInTheDocument();
  });

  it('shows no section while the namespace lists no Harness at all', async () => {
    mockUseResources.mockReturnValue(listing([]));
    await render();

    expect(screen.queryByText('Runtime')).not.toBeInTheDocument();
  });

  it("says so when the namespace's Harnesses could not be read, and keeps the platform Harness", async () => {
    mockUseResources.mockReturnValue(
      listing([], [{ cluster: 'gazelle', error: new Error('Forbidden') }]),
    );
    await render();

    expect(screen.getByText('Could not read the runtimes')).toBeInTheDocument();
    expect(
      screen.getByText(/so the agent runs on the platform Harness\.$/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });

  it("offers an Organization's editor the platform Harness of the tenant, without a warning for the platform namespace they may not read", async () => {
    probeTenant = 'org-acme';
    listingByNamespace({
      'org-acme': [harness('kagent', 'kagent', { namespace: 'org-acme' })],
    });
    await render();

    expect(
      screen.queryByText('Could not read the runtimes'),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    const card = screen.getByRole('listitem');
    expect(card).toHaveTextContent('Declarative (Go ADK)');
    expect(card).toHaveTextContent('Harness kagent');
    expect(
      screen.getByText(
        'The agents of organization acme run on the platform Harness.',
      ),
    ).toBeInTheDocument();
  });

  it('offers an admin creating in an Organization the platform Harness only, though the platform namespace lists more', async () => {
    probeTenant = 'org-acme';
    listingByNamespace({
      kagent: [
        harness('kagent', 'kagent'),
        harness('claude', 'claude'),
        harness('codex', 'codex'),
      ],
      'org-acme': [harness('kagent', 'kagent', { namespace: 'org-acme' })],
    });
    await render();

    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    const cards = screen.getAllByRole('listitem');
    expect(cards).toHaveLength(1);
    expect(cards[0]).toHaveTextContent('Harness kagent');
  });

  it("titles a card by the Harness's display name when an admin set one", async () => {
    mockUseResources.mockReturnValue(
      listing([
        harness('kagent', 'kagent'),
        harness('go', 'claude', { displayName: 'Claude Code with Go' }),
      ]),
    );
    await render();

    expect(
      screen.getByRole('radio', {
        name: 'Claude Code with Go, Harness go',
      }),
    ).toBeInTheDocument();
  });

  it('tells the person when a model in another namespace drops their pick', async () => {
    mockUseResources.mockReturnValue(
      listing([harness('claude', 'claude'), harness('kagent', 'kagent')]),
    );
    const user = userEvent.setup();
    await render();

    await user.click(screen.getByRole('radio', { name: /Harness claude/ }));
    expect(formHarness).toBe('claude');

    mockUseResources.mockReturnValue(
      listing([harness('kagent', 'kagent', { namespace: 'demo' })]),
    );
    await user.click(
      screen.getByRole('button', { name: 'Pick a model in demo' }),
    );

    expect(formHarness).toBeUndefined();
    expect(screen.getByRole('status')).toHaveTextContent(
      "The Harness claude does not serve this model's namespace",
    );
  });

  it("lists the model's namespace's Harnesses, the platform one picked, and records another pick", async () => {
    mockUseResources.mockReturnValue(
      listing([harness('claude', 'claude'), harness('kagent', 'kagent')]),
    );
    const user = userEvent.setup();
    await render();

    expect(mockUseResources).toHaveBeenLastCalledWith(
      ['gazelle'],
      Harness,
      { gazelle: { namespace: 'kagent' } },
      expect.objectContaining({ enabled: true }),
    );
    const cards = screen.getAllByRole('radio');
    expect(cards.map(card => card.getAttribute('aria-label'))).toEqual([
      'Declarative (Go ADK), Harness kagent, platform default',
      'Claude Code, Harness claude',
    ]);
    expect(cards[0]).toHaveAttribute('aria-checked', 'true');
    expect(cards[0]).toHaveTextContent('Platform default');

    await user.click(cards[1]);
    expect(formHarness).toBe('claude');
    expect(
      screen.getByRole('radio', { name: /Harness claude/ }),
    ).toHaveAttribute('aria-checked', 'true');
    expect(cards[1]).toHaveTextContent('Claude Code');

    // Back to the platform Harness is no pick at all.
    await user.click(screen.getByRole('radio', { name: /Harness kagent/ }));
    expect(formHarness).toBeUndefined();
  });

  it('offers a Codex card where the namespace holds a codex Harness, and records its pick', async () => {
    mockUseResources.mockReturnValue(
      listing([
        harness('kagent', 'kagent'),
        harness('claude', 'claude'),
        harness('codex', 'codex'),
      ]),
    );
    const user = userEvent.setup();
    await render();

    const codex = screen.getByRole('radio', { name: 'Codex, Harness codex' });
    expect(codex).toHaveTextContent('Codex');
    expect(codex).toHaveTextContent('codex-harness');
    expect(codex).toHaveAttribute('aria-checked', 'false');

    await user.click(codex);
    expect(formHarness).toBe('codex');
  });

  it('offers no Codex card in a namespace without a codex Harness', async () => {
    mockUseResources.mockReturnValue(
      listing([
        harness('kagent', 'kagent'),
        harness('claude', 'claude'),
        harness('codex', 'codex', { namespace: 'other' }),
      ]),
    );
    await render();

    expect(screen.getAllByRole('radio')).toHaveLength(2);
    expect(
      screen.queryByRole('radio', { name: /Codex/ }),
    ).not.toBeInTheDocument();
  });

  it('says the runtimes are loading while the list is being read', async () => {
    mockUseResources.mockReturnValue(listing([], [], true));
    await render();

    expect(screen.getByText('Loading runtimes…')).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
  });

  it('selects only the clicked card when two Harnesses share a runtime', async () => {
    mockUseResources.mockReturnValue(
      listing([
        harness('kagent', 'kagent'),
        harness('claude-go', 'claude'),
        harness('claude-rust', 'claude'),
      ]),
    );
    const user = userEvent.setup();
    await render();

    await user.click(screen.getByRole('radio', { name: /Harness claude-go/ }));
    expect(formHarness).toBe('claude-go');
    expect(
      screen.getByRole('radio', { name: /Harness claude-go/ }),
    ).toHaveAttribute('aria-checked', 'true');
    expect(
      screen.getByRole('radio', { name: /Harness claude-rust/ }),
    ).toHaveAttribute('aria-checked', 'false');
  });

  it('warns that the list may be incomplete when part of it could not be read', async () => {
    mockUseResources.mockReturnValue(
      listing(
        [harness('kagent', 'kagent'), harness('claude', 'claude')],
        [{ cluster: 'gazelle', error: new Error('Forbidden') }],
      ),
    );
    await render();

    expect(
      screen.getByText(
        'Could not read some runtimes, so the list may be incomplete.',
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(2);
  });

  it('shows no limits for a Claude Code Harness', async () => {
    const user = userEvent.setup();
    mockUseResources.mockReturnValue(
      listing([harness('kagent', 'kagent'), harness('claude', 'claude')]),
    );
    await render();

    await user.click(screen.getByRole('radio', { name: /Harness claude/ }));

    expect(formHarness).toBe('claude');
    expect(screen.queryByRole('group', { name: 'Limits' })).toBeNull();
    expect(screen.queryByText(/per turn/)).toBeNull();
  });
});
