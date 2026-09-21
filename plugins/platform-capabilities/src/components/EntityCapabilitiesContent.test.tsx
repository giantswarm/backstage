import { renderInTestApp } from '@backstage/frontend-test-utils';
import { TestApiProvider } from '@backstage/test-utils';
import { EntityProvider } from '@backstage/plugin-catalog-react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { platformCapabilitiesApiRef } from '../apis';
import {
  ACTION,
  ENABLED,
  ENABLED_NOT_OPTED_IN,
  FakeApi,
  FakeOptions,
  NOT_OPTED_IN,
} from '../fixtures/fakeApi';
import { EntityCapabilitiesContent } from './EntityCapabilitiesContent';
import { platformCapabilitiesQueryClient } from './Providers';

jest.mock('./connectBounce', () => ({
  ...jest.requireActual('./connectBounce'),
  bounceToConnect: jest.fn(),
}));

const entityOf = (name: string) => ({
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Resource',
  metadata: { name, namespace: 'default' },
  spec: { type: 'installation' },
});

async function render(name: string, options: FakeOptions = {}) {
  const api = new FakeApi(options);
  await renderInTestApp(
    <TestApiProvider apis={[[platformCapabilitiesApiRef, api]]}>
      <EntityProvider entity={entityOf(name)}>
        <EntityCapabilitiesContent />
      </EntityProvider>
    </TestApiProvider>,
  );
  await waitFor(() =>
    expect(screen.getByTestId('capability-agent-platform')).toBeInTheDocument(),
  );
  await waitFor(() => expect(screen.queryByTestId('comparing')).toBeNull());
  return api;
}

const dialog = () => screen.getByRole('form', { name: /agent-platform on/ });

describe('EntityCapabilitiesContent', () => {
  beforeEach(() => platformCapabilitiesQueryClient.clear());

  it('shows one block per capability with its comparison, and the history', async () => {
    const api = await render('birch', {
      installations: [ENABLED],
      actions: [ACTION],
    });
    const card = screen.getByTestId('capability-agent-platform');
    expect(within(card).getByTestId('capability-state')).toHaveTextContent(
      'Installed · 2 differences',
    );
    expect(
      within(card).getByTestId('choice-modelServing.enabled'),
    ).toHaveTextContent('Model serving: off');
    expect(within(card).getByTestId('feature-secrets')).toHaveTextContent(
      'Secrets — 1 difference',
    );
    expect(
      within(card).getByRole('button', { name: 'Apply changes' }),
    ).toBeEnabled();
    expect(within(card).queryByRole('button', { name: 'Verify' })).toBeNull();
    expect(api.verifies).toHaveLength(1);
    const history = screen.getByTestId('action-history');
    expect(
      await within(history).findByTestId(`history-${ACTION.name}`),
    ).toHaveTextContent('enable agent-platform — someone');
  });

  it('Enable opens the form from the definition schema, prefilled from the record, reviews with its values, then opens the pull requests', async () => {
    const api = await render('rowan');
    await userEvent.click(screen.getByRole('button', { name: 'Enable' }));
    const form = dialog();
    // Groups and fields as the schema names them; the record is prefilled.
    expect(within(form).getByTestId('group-kagent')).toBeInTheDocument();
    expect(within(form).getByLabelText(/^baseDomain/)).toHaveValue(
      'rowan.example.test',
    );
    // A choice per boolean: the two required ones unmade, the person's one at its default.
    expect(within(form).getAllByText('enabled')).toHaveLength(3);
    expect(within(form).getByTestId('missing-required')).toHaveTextContent(
      'kagent.enabled, portal.enabled',
    );
    await userEvent.clear(within(form).getByLabelText(/^targets/));
    await userEvent.type(
      within(form).getByLabelText(/^targets/),
      'hazel, birch',
    );

    await userEvent.click(within(form).getByRole('button', { name: 'Review' }));
    await waitFor(() =>
      expect(within(dialog()).getByTestId('plan')).toBeInTheDocument(),
    );
    // The review is the comparison with the form's values; nothing is written.
    expect(api.writes).toHaveLength(0);
    expect(api.verifies[1]).toMatchObject({
      installation: 'rowan',
      capability: 'agent-platform',
      args: {
        inputs: {
          installation: { baseDomain: 'rowan.example.test', chartLine: '4' },
          federation: { targets: ['hazel', 'birch'] },
          modelServing: { enabled: false },
        },
      },
    });
    expect((api.verifies[1].args?.inputs as any).kagent).toBeUndefined();

    const plan = within(dialog()).getByTestId('plan');
    expect(within(plan).getByTestId('plan-files')).toHaveTextContent(
      'configmap-values.yaml.patch — update',
    );
    expect(within(plan).getByTestId('plan-secrets')).toHaveTextContent(
      'dex-client-kagent — client secret, 32 characters',
    );
    expect(within(plan).getByTestId('plan-dex-clients')).toHaveTextContent(
      'https://kagent.rowan.example.test/oauth2/callback',
    );
    expect(within(plan).getByTestId('plan-customer-actions')).toHaveTextContent(
      'Provide the model API key',
    );
    expect(within(plan).getByTestId('plan-pull-requests')).toHaveTextContent(
      'example/example-configs — 1 change(s)',
    );
    expect(within(dialog()).getByTestId('feature-runtime')).toHaveTextContent(
      'Runtime — 1 difference',
    );

    const open = within(dialog()).getByRole('button', {
      name: 'Open pull requests',
    });
    expect(open).toBeEnabled();
    await userEvent.click(open);
    await waitFor(() =>
      expect(within(dialog()).getByTestId('committed')).toBeInTheDocument(),
    );
    expect(api.writes).toHaveLength(1);
    expect(api.writes[0]).toMatchObject({
      tool: 'enable_capability',
      installation: 'rowan',
      options: { mode: 'commit' },
      args: { inputs: { federation: { targets: ['hazel', 'birch'] } } },
    });
    expect(
      within(dialog()).getByTestId('action-pull-requests'),
    ).toHaveTextContent('example/example-configs#7 — open');
  });

  it('disables Open pull requests without the session', async () => {
    await render('rowan', {
      connection: { connected: false, authUrl: 'https://muster.test/connect' },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Enable' }));
    await userEvent.click(
      within(dialog()).getByRole('button', { name: 'Review' }),
    );
    await waitFor(() =>
      expect(within(dialog()).getByTestId('plan')).toBeInTheDocument(),
    );
    expect(
      within(dialog()).getByRole('button', { name: 'Open pull requests' }),
    ).toBeDisabled();
    expect(within(dialog()).getByText('Needs your session')).toBeVisible();
  });

  it('an installation not opted in names the file the owners add, with the button disabled', async () => {
    await render('alder', { installations: [NOT_OPTED_IN] });
    const card = screen.getByTestId('capability-agent-platform');
    expect(within(card).getByTestId('capability-state')).toHaveTextContent(
      'Not installed',
    );
    expect(within(card).getByTestId('needs-owners')).toHaveTextContent(
      'Needs example/example-management-clusters: management-clusters/alder/platform-manager.yaml with optIn: true from the owners.',
    );
    expect(within(card).getByRole('button', { name: 'Enable' })).toBeDisabled();
    expect(within(card).queryByTestId('opt-in-note')).toBeNull();
  });

  it('an installation enabled by its owners without the opt-in reads Installed with its comparison, names the file, the button disabled', async () => {
    await render('maple', { installations: [ENABLED_NOT_OPTED_IN] });
    const card = screen.getByTestId('capability-agent-platform');
    expect(within(card).getByTestId('capability-state')).toHaveTextContent(
      'Installed · 2 differences',
    );
    expect(within(card).getByTestId('needs-owners')).toHaveTextContent(
      'management-clusters/maple/platform-manager.yaml with optIn: true from the owners.',
    );
    expect(
      within(card).getByRole('button', { name: 'Apply changes' }),
    ).toBeDisabled();
  });
});
