import { useEffect } from 'react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { NewAgentFormProvider, useNewAgentForm } from '../NewAgentFormProvider';
import { TenantPicker } from '../TenantPicker';
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

// What agent-manager answers for an Organization's editor: the one tenant
// they may create in.
jest.mock('../../hooks/useAgentManager', () => ({
  useAgentManagerInfo: (installation: string | undefined) => ({
    info: installation
      ? { namespaces: { default: 'kagent', managed: ['org-acme'] } }
      : undefined,
    isLoading: false,
    error: null,
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
  it("preselects the tenant's model when the tenant is known in the same render as the models", async () => {
    mockModelConfigs = [modelConfig('default-model-config', 'Claude Sonnet')];

    function WithTenant() {
      const { state, setInstallation } = useNewAgentForm();
      useEffect(() => {
        if (!state.installation) {
          setInstallation('gazelle');
        }
      }, [state.installation, setInstallation]);
      return state.installation ? (
        <>
          <TenantPicker />
          <ModelConfigPicker />
        </>
      ) : null;
    }
    await renderInTestApp(
      <NewAgentFormProvider>
        <WithTenant />
      </NewAgentFormProvider>,
    );

    // The tenant's copy of the platform's default model, not the platform's
    // own, which would create the agent in the platform tenant.
    expect(
      await screen.findByRole('radio', {
        name: 'Select model Claude Sonnet, environment default',
      }),
    ).toHaveAttribute('aria-checked', 'true');
  });

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

  describe('at list scale', () => {
    const manyModels = (count: number) =>
      Array.from({ length: count }, (_, i) => {
        const n = String(i).padStart(3, '0');
        return modelConfig(`model-${n}`, `Model ${n}`);
      });

    it('draws three models with no paging chrome', async () => {
      mockModelConfigs = manyModels(3);

      await renderPicker();

      expect(await screen.findAllByRole('radio')).toHaveLength(3);
      expect(
        screen.queryByRole('button', { name: /^Show \d+ more/ }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(/shown/)).not.toBeInTheDocument();
      expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    });

    it('draws the first 12 of 300 models and pages in the rest', async () => {
      mockModelConfigs = manyModels(300);

      await renderPicker();

      expect(await screen.findAllByRole('radio')).toHaveLength(12);
      expect(screen.getByText('12 models shown, 288 more')).toBeInTheDocument();

      await userEvent.click(
        screen.getByRole('button', { name: 'Show 12 more models' }),
      );

      expect(screen.getAllByRole('radio')).toHaveLength(24);
    });

    it('keeps the picked model on screen when it is listed past the first page', async () => {
      mockModelConfigs = manyModels(300);
      mockModelConfigs[200] = modelConfig(
        'default-model-config',
        'Claude Sonnet',
      );

      await renderPicker();

      expect(
        await screen.findByRole('radio', {
          name: 'Select model Claude Sonnet, environment default',
        }),
      ).toHaveAttribute('aria-checked', 'true');
      // The first page, and the picked one after it.
      expect(screen.getAllByRole('radio')).toHaveLength(13);
    });
  });
});
