import { useEffect } from 'react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { NewAgentFormProvider, useNewAgentForm } from '../NewAgentFormProvider';
import { ModelConfigPicker } from './ModelConfigPicker';

type FakeModelConfig = {
  getName: () => string;
  getNamespace: () => string;
  getDisplayName: () => string;
  getModel: () => string;
  getProvider: () => string;
};

function modelConfig(name: string, displayName: string): FakeModelConfig {
  return {
    getName: () => name,
    getNamespace: () => 'kagent',
    getDisplayName: () => displayName,
    getModel: () => `${name}-model`,
    getProvider: () => 'Anthropic',
  };
}

let mockModelConfigs: FakeModelConfig[] = [];
jest.mock('../ModelConfigsProvider', () => ({
  useModelConfigs: () => ({
    isLoading: false,
    unreachableInstallations: [],
    modelConfigsFor: () => mockModelConfigs,
  }),
}));

function WithInstallation({ error }: { error?: string }) {
  const { state, setInstallation } = useNewAgentForm();
  useEffect(() => {
    if (!state.installation) {
      setInstallation('gazelle');
    }
  }, [state.installation, setInstallation]);
  return state.installation ? <ModelConfigPicker error={error} /> : null;
}

async function renderPicker(error?: string) {
  await renderInTestApp(
    <NewAgentFormProvider>
      <WithInstallation error={error} />
    </NewAgentFormProvider>,
  );
}

describe('ModelConfigPicker', () => {
  it("preselects the installation's default model and says so", async () => {
    mockModelConfigs = [
      modelConfig('haiku', 'Claude Haiku'),
      modelConfig('default-model-config', 'Claude Sonnet'),
    ];

    await renderPicker();

    expect(
      await screen.findByText(
        'Preselected: Claude Sonnet, the default model on gazelle.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('radio', {
        name: 'Select model Claude Sonnet, environment default',
      }),
    ).toHaveAttribute('aria-checked', 'true');
  });

  it('shows the form’s validation problem under its label and ties it to the choices', async () => {
    mockModelConfigs = [modelConfig('haiku', 'Claude Haiku')];

    await renderPicker('Select a model');

    const message = await screen.findByText('Select a model');
    const group = screen.getByRole('radiogroup', { name: 'Model' });
    expect(group).toHaveAttribute('aria-describedby', message.id);
    expect(group.closest('[data-invalid]')).not.toBeNull();
  });

  it('preselects the only model and says so', async () => {
    mockModelConfigs = [modelConfig('sonnet', 'Claude Sonnet')];

    await renderPicker();

    expect(
      await screen.findByText(
        'Preselected: Claude Sonnet, the only model on gazelle.',
      ),
    ).toBeInTheDocument();
  });

  it('falls back to the first model when there is no default', async () => {
    mockModelConfigs = [
      modelConfig('haiku', 'Claude Haiku'),
      modelConfig('opus', 'Claude Opus'),
    ];

    await renderPicker();

    expect(
      await screen.findByText(
        'Preselected: Claude Haiku, the first one listed, since gazelle has no default model.',
      ),
    ).toBeInTheDocument();
  });

  it('keeps a pick of the person’s own and drops the preselection note', async () => {
    mockModelConfigs = [
      modelConfig('default-model-config', 'Claude Sonnet'),
      modelConfig('opus', 'Claude Opus'),
    ];

    await renderPicker();
    await screen.findByText(/^Preselected: Claude Sonnet/);

    await userEvent.click(
      screen.getByRole('radio', { name: 'Select model Claude Opus' }),
    );

    expect(
      screen.getByRole('radio', { name: 'Select model Claude Opus' }),
    ).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByText(/^Preselected:/)).not.toBeInTheDocument();
  });
});
