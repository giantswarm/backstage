import { useEffect } from 'react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Harness,
  type ClaudeHarnessLimits,
} from '@giantswarm/backstage-plugin-kubernetes-react';

import { NewAgentFormProvider, useNewAgentForm } from '../NewAgentFormProvider';
import { HarnessPicker } from './HarnessPicker';

const mockUseResources = jest.fn();
jest.mock('@giantswarm/backstage-plugin-kubernetes-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-kubernetes-react'),
  useResources: (...args: unknown[]) => mockUseResources(...args),
}));

jest.mock('../../hooks/useAgentManager', () => ({
  useAgentManagerInfo: () => ({
    info: { harness: { name: 'kagent' } },
    isLoading: false,
    error: null,
  }),
}));

function harness(
  name: string,
  runtime: 'kagent' | 'claude',
  {
    namespace = 'kagent',
    displayName = undefined as string | undefined,
    limits = undefined as ClaudeHarnessLimits | undefined,
  } = {},
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
        [runtime]: limits ? { limits } : {},
        workload: { image: `registry.example/${name}-harness@sha256:0123` },
      },
    } as never,
    'gazelle',
  );
}

let formHarness: string | undefined;

function Probe() {
  const { state, setInstallation, selectModelConfig } = useNewAgentForm();
  useEffect(() => {
    setInstallation('gazelle');
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

beforeEach(() => {
  formHarness = undefined;
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
      screen.getByText(
        'What runs the agent: the only Harness in kagent on gazelle.',
      ),
    ).toBeInTheDocument();
  });

  it('shows no section while the namespace lists no Harness at all', async () => {
    mockUseResources.mockReturnValue(listing([]));
    await render();

    expect(screen.queryByText('Runtime')).not.toBeInTheDocument();
  });

  it("says so when the namespace's Harnesses could not be read", async () => {
    mockUseResources.mockReturnValue(
      listing([], [{ cluster: 'gazelle', error: new Error('Forbidden') }]),
    );
    await render();

    expect(screen.getByText("Couldn't read the runtimes")).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
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
      "The Harness claude you picked doesn't serve this model's namespace",
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
        "Some runtimes couldn't be loaded; the list may be incomplete.",
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(2);
  });

  it('shows the limits of a Claude Code platform Harness, read-only', async () => {
    mockUseResources.mockReturnValue(
      listing([
        harness('kagent', 'claude', {
          limits: { budgetUSD: '1.50', maxTurns: 20 },
        }),
      ]),
    );
    await render();

    const limits = screen.getByRole('group', { name: 'Limits' });
    expect(limits).toHaveTextContent('Budget per turn$1.50');
    expect(limits).toHaveTextContent('Max turns20');
    expect(limits).toHaveTextContent(
      'Set on the Harness kagent; they apply to every agent on it.',
    );
    expect(limits.querySelector('input, button')).toBeNull();
  });

  it('follows the pick: the limits of the Claude Code Harness chosen, none for a declarative one', async () => {
    const user = userEvent.setup();
    mockUseResources.mockReturnValue(
      listing([
        harness('kagent', 'kagent'),
        harness('claude', 'claude', { limits: { maxTurns: 8 } }),
      ]),
    );
    await render();

    expect(screen.queryByRole('group', { name: 'Limits' })).toBeNull();

    await user.click(screen.getByRole('radio', { name: /Harness claude/ }));

    expect(screen.getByRole('group', { name: 'Limits' })).toHaveTextContent(
      'Max turns8',
    );
  });

  it('says a Claude Code Harness sets no limits', async () => {
    mockUseResources.mockReturnValue(listing([harness('kagent', 'claude')]));
    await render();

    expect(screen.getByRole('group', { name: 'Limits' })).toHaveTextContent(
      'None set on the Harness kagent.',
    );
  });
});
