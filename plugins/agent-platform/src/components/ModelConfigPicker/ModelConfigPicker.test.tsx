import { useEffect } from 'react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  NewAgentFormProvider,
  useNewAgentForm,
  useTenantChoicesSync,
} from '../NewAgentFormProvider';
import { useOwnerField } from '../NewAgentPage/hooks/useOwnerField';
import { ModelConfigPicker } from './ModelConfigPicker';

// The organizations agent-manager names for the person
// (`list_organizations`).
jest.mock('../OrganizationDirectoryProvider', () => ({
  ...jest.requireActual('../OrganizationDirectoryProvider'),
  useOrganizationDirectory: () =>
    jest.requireActual('../../lib/__fixtures__/organizations')
      .TEST_ORGANIZATION_DIRECTORY,
}));

type FakeModelConfig = {
  getName: () => string;
  getNamespace: () => string;
  getDisplayName: () => string;
  getModel: () => string;
  getProvider: () => string;
  getReadiness: () => 'accepted' | 'notAccepted';
  getReadinessMessage: () => string | undefined;
};

/** The Owner field, wherever the page would put it, fed as a step feeds it. */
function OwnerFieldHarness() {
  useTenantChoicesSync();
  return <>{useOwnerField().field}</>;
}

function modelConfig(
  name: string,
  displayName: string,
  { namespace = 'kagent', rejected = false } = {},
): FakeModelConfig {
  return {
    getName: () => name,
    getNamespace: () => namespace,
    getDisplayName: () => displayName,
    getModel: () => `${name}-model`,
    getProvider: () => 'Anthropic',
    getReadiness: () => (rejected ? 'notAccepted' : 'accepted'),
    getReadinessMessage: () =>
      rejected ? `Secret ${namespace}/${name}-key not found` : undefined,
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

// What agent-manager answers: the namespaces the person may create in, and
// per namespace its models with the one it resolves as the default.
let mockManaged = ['kagent'];
jest.mock('../../hooks/useAgentManager', () => ({
  useAgentManagerInfo: (installation: string | undefined) => ({
    info: installation
      ? { namespaces: { default: 'kagent', managed: mockManaged } }
      : undefined,
    isLoading: false,
    error: null,
  }),
}));

let mockDefaults: Record<string, string> = {};
let mockUnresolved: string[] = [];
jest.mock('../../hooks/useAgentManagerModelConfigs', () => ({
  useAgentManagerModelConfigs: (_installation: string, namespace: string) => ({
    modelConfigs: mockModelConfigs
      .filter(mc => mc.getNamespace() === namespace)
      .map(mc => ({
        name: mc.getName(),
        namespace,
        accepted: true,
        resolvedRefs: !mockUnresolved.includes(mc.getName()),
        default: mockDefaults[namespace] === mc.getName(),
      })),
    isLoading: false,
  }),
}));

function WithInstallation({ error }: { error?: string }) {
  const { state, setInstallation } = useNewAgentForm();
  useEffect(() => {
    if (!state.installation) {
      setInstallation('gazelle');
    }
  }, [state.installation, setInstallation]);
  return state.installation ? (
    <>
      <OwnerFieldHarness />
      <ModelConfigPicker error={error} />
    </>
  ) : null;
}

async function renderPicker(error?: string) {
  await renderInTestApp(
    <NewAgentFormProvider>
      <WithInstallation error={error} />
    </NewAgentFormProvider>,
  );
}

describe('ModelConfigPicker', () => {
  beforeEach(() => {
    mockManaged = ['kagent'];
    mockDefaults = {};
    mockUnresolved = [];
  });

  it('preselects the default agent-manager reports for the owner picked, Platform', async () => {
    mockManaged = ['kagent', 'org-acme'];
    mockModelConfigs = [
      modelConfig('sonnet', 'Claude Sonnet'),
      modelConfig('acme-opus', 'Acme Opus', { namespace: 'org-acme' }),
    ];
    mockDefaults = { kagent: 'sonnet', 'org-acme': 'acme-opus' };

    function WithOwnerField() {
      const { state, setInstallation } = useNewAgentForm();
      useEffect(() => {
        if (!state.installation) {
          setInstallation('gazelle');
        }
      }, [state.installation, setInstallation]);
      return state.installation ? (
        <>
          <OwnerFieldHarness />
          <ModelConfigPicker />
        </>
      ) : null;
    }
    await renderInTestApp(
      <NewAgentFormProvider>
        <WithOwnerField />
      </NewAgentFormProvider>,
    );

    expect(
      await screen.findByRole('radio', {
        name: 'Select model Claude Sonnet, default',
      }),
    ).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByRole('radio', { name: /Acme Opus/ })).toBeNull();
    expect(
      screen.queryByText('Choose who the agent belongs to first'),
    ).toBeNull();
  });

  it("offers an organization only its own models, the platform's not copied in", async () => {
    mockManaged = ['org-acme'];
    mockModelConfigs = [
      modelConfig('sonnet', 'Claude Sonnet'),
      modelConfig('acme-opus', 'Acme Opus', { namespace: 'org-acme' }),
    ];
    mockDefaults = { kagent: 'sonnet', 'org-acme': 'acme-opus' };

    function WithTenant() {
      const { state, setInstallation } = useNewAgentForm();
      useEffect(() => {
        if (!state.installation) {
          setInstallation('gazelle');
        }
      }, [state.installation, setInstallation]);
      return state.installation ? (
        <>
          <OwnerFieldHarness />
          <ModelConfigPicker />
        </>
      ) : null;
    }
    await renderInTestApp(
      <NewAgentFormProvider>
        <WithTenant />
      </NewAgentFormProvider>,
    );

    expect(
      await screen.findByRole('radio', {
        name: 'Select model Acme Opus, default',
      }),
    ).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByRole('radio', { name: /Claude Sonnet/ })).toBeNull();
    expect(
      screen.getByText(
        'Preselected: Acme Opus, the default model for the acme organization.',
      ),
    ).toBeInTheDocument();
  });

  it('preselects the default and says so, badging it among the others', async () => {
    mockModelConfigs = [
      modelConfig('haiku', 'Claude Haiku'),
      modelConfig('sonnet', 'Claude Sonnet'),
    ];
    mockDefaults = { kagent: 'sonnet' };

    await renderPicker();

    expect(
      await screen.findByText(
        'Preselected: Claude Sonnet, the default model for the platform.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('radio', {
        name: 'Select model Claude Sonnet, default',
      }),
    ).toHaveAttribute('aria-checked', 'true');
    expect(screen.getAllByText('Default')).toHaveLength(1);
  });

  it('shows the form’s validation problem under its label and ties it to the choices', async () => {
    mockModelConfigs = [modelConfig('haiku', 'Claude Haiku')];

    await renderPicker('Select a model');

    const message = await screen.findByText('Select a model');
    const group = screen.getByRole('radiogroup', { name: 'Model' });
    expect(group).toHaveAttribute('aria-describedby', message.id);
    expect(group.closest('[data-invalid]')).not.toBeNull();
  });

  it('makes the person pick without a default, even the only model', async () => {
    mockModelConfigs = [modelConfig('sonnet', 'Claude Sonnet')];

    await renderPicker();

    expect(
      await screen.findByText(
        'No default model is set for the platform. Choose the model this agent runs on.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('radio', { name: 'Select model Claude Sonnet' }),
    ).toHaveAttribute('aria-checked', 'false');
  });

  it('gives default-model-config no special meaning', async () => {
    mockModelConfigs = [
      modelConfig('default-model-config', 'Claude Sonnet'),
      modelConfig('opus', 'Claude Opus'),
    ];

    await renderPicker();

    expect(
      await screen.findByText(/^No default model is set for the platform/),
    ).toBeInTheDocument();
    expect(screen.queryByText('Default')).toBeNull();
  });

  it('warns when the picked model does not resolve, and marks it in the list', async () => {
    mockModelConfigs = [
      modelConfig('sonnet', 'Claude Sonnet', { rejected: true }),
      modelConfig('opus', 'Claude Opus'),
    ];
    mockDefaults = { kagent: 'sonnet' };
    mockUnresolved = ['sonnet'];

    await renderPicker();

    expect(
      await screen.findByText('Claude Sonnet is not ready'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Agents on this model fail until an admin fixes it: Secret kagent/sonnet-key not found You can still create the agent, or choose another model.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('radio', {
        name: 'Select model Claude Sonnet, default, not accepted',
      }),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('radio', { name: 'Select model Claude Opus' }),
    );
    expect(screen.queryByText('Claude Sonnet is not ready')).toBeNull();
  });

  it('keeps a pick of the person’s own and drops the preselection note', async () => {
    mockModelConfigs = [
      modelConfig('sonnet', 'Claude Sonnet'),
      modelConfig('opus', 'Claude Opus'),
    ];
    mockDefaults = { kagent: 'sonnet' };

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
      mockModelConfigs[200] = modelConfig('sonnet', 'Claude Sonnet');
      mockDefaults = { kagent: 'sonnet' };

      await renderPicker();

      expect(
        await screen.findByRole('radio', {
          name: 'Select model Claude Sonnet, default',
        }),
      ).toHaveAttribute('aria-checked', 'true');
      expect(screen.getAllByRole('radio')).toHaveLength(13);
    });
  });
});
