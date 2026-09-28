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

function harness(name: string, runtime: 'kagent' | 'claude'): Harness {
  return new Harness(
    {
      apiVersion: 'kagent.dev/v1alpha3',
      kind: 'Harness',
      metadata: { name, namespace: 'kagent' },
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
  return null;
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
    mockUseResources.mockReturnValue({
      resources: [harness('kagent', 'kagent')],
      isLoading: false,
      errors: [],
    });
    await render();

    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
  });

  it("lists the model's namespace's Harnesses, the platform one picked, and records another pick", async () => {
    mockUseResources.mockReturnValue({
      resources: [harness('claude', 'claude'), harness('kagent', 'kagent')],
      isLoading: false,
      errors: [],
    });
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
      'Run on the Harness kagent',
      'Run on the Harness claude',
    ]);
    expect(cards[0]).toHaveAttribute('aria-checked', 'true');
    expect(cards[0]).toHaveTextContent('Platform default');

    await user.click(cards[1]);
    expect(formHarness).toBe('claude');
    expect(screen.getByRole('radio', { name: /claude/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(cards[1]).toHaveTextContent('Claude Code');

    // Back to the platform Harness is no pick at all.
    await user.click(screen.getByRole('radio', { name: /kagent/ }));
    expect(formHarness).toBeUndefined();
  });
});
