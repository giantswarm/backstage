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
    info: { harness: { name: 'kagent' } },
    isLoading: false,
    error: null,
  }),
}));

function harness(
  name: string,
  runtime: 'kagent' | 'claude',
  { namespace = 'kagent', displayName = undefined as string | undefined } = {},
): Harness {
  return new Harness(
    {
      apiVersion: 'kagent.dev/v1alpha3',
      kind: 'Harness',
      metadata: {
        name,
        namespace,
        ...(displayName && {
          annotations: { 'ui.giantswarm.io/display-name': displayName },
        }),
      },
      spec: {
        allowedAgentTemplates: {
          selector: {
            matchLabels: { 'agent-platform.giantswarm.io/harness': name },
          },
        },
        [runtime]: {},
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
  formHarness = state.harness?.admits;
  return (
    <button type="button" onClick={() => selectModelConfig('sonnet', 'demo')}>
      Pick a model in demo
    </button>
  );
}

function listing(resources: Harness[], errors: unknown[] = []) {
  return { resources, isLoading: false, errors };
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
  it('shows no choice when the namespace holds the platform Harness only', async () => {
    mockUseResources.mockReturnValue(listing([harness('kagent', 'kagent')]));
    await render();

    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
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
      'You picked the Harness claude for a different namespace',
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
});
