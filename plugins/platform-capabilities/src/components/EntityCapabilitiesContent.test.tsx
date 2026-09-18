import { renderInTestApp } from '@backstage/frontend-test-utils';
import { TestApiProvider } from '@backstage/test-utils';
import { EntityProvider } from '@backstage/plugin-catalog-react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { platformCapabilitiesApiRef } from '../apis';
import {
  ACTION,
  FakeApi,
  FakeOptions,
  installation,
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
  return api;
}

const dialog = () => screen.getByRole('form', { name: /agent-platform on/ });

async function openReview(action: 'Enable' | 'Reconcile' = 'Enable') {
  await userEvent.click(screen.getByRole('button', { name: action }));
  await waitFor(() => expect(dialog()).toBeInTheDocument());
  await userEvent.click(
    within(dialog()).getByRole('button', { name: 'Review' }),
  );
  await waitFor(() =>
    expect(within(dialog()).getByTestId('plan')).toBeInTheDocument(),
  );
}

describe('EntityCapabilitiesContent', () => {
  beforeEach(() => platformCapabilitiesQueryClient.clear());

  it('shows the state, the inputs on record, the last action and the history', async () => {
    const enabled = installation({
      capabilities: [
        {
          name: 'agent-platform',
          state: 'enabled',
          enabled: true,
          inputs: { installation: installation().record },
          lastAction: { name: ACTION.name, result: 'pending approval' },
        },
      ],
    });
    await render('rowan', { installations: [enabled], actions: [ACTION] });
    const card = screen.getByTestId('capability-agent-platform');
    expect(within(card).getByTestId('capability-state')).toHaveTextContent(
      'enabled',
    );
    expect(within(card).getByTestId('inputs-on-record')).toHaveTextContent(
      'installation.baseDomainrowan.example.test',
    );
    expect(within(card).getByTestId('last-action')).toHaveTextContent(
      `Last action: ${ACTION.name} — pending approval`,
    );
    expect(
      within(card).getByRole('button', { name: 'Reconcile' }),
    ).toBeVisible();
    const history = screen.getByTestId('action-history');
    expect(
      await within(history).findByTestId(`history-${ACTION.name}`),
    ).toHaveTextContent('enable agent-platform — someone');
  });

  it('Enable opens the form from the definition schema, prefilled from the record, then the dry run, then commits', async () => {
    const api = await render('rowan');
    await userEvent.click(screen.getByRole('button', { name: 'Enable' }));
    const form = dialog();
    // Groups and fields as the schema names them; the record is prefilled.
    expect(within(form).getByTestId('group-kagent')).toBeInTheDocument();
    expect(within(form).getByLabelText(/^baseDomain/)).toHaveValue(
      'rowan.example.test',
    );
    // A choice per required boolean (kagent.enabled, portal.enabled), neither made.
    expect(within(form).getAllByText('enabled')).toHaveLength(2);
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
    expect(api.writes).toHaveLength(1);
    expect(api.writes[0]).toMatchObject({
      tool: 'enable_capability',
      installation: 'rowan',
      capability: 'agent-platform',
      options: { dryRun: true },
      args: {
        inputs: {
          installation: { baseDomain: 'rowan.example.test', chartLine: '4' },
          federation: { targets: ['hazel', 'birch'] },
        },
      },
    });
    expect((api.writes[0].args.inputs as any).kagent).toBeUndefined();

    const plan = within(dialog()).getByTestId('plan');
    expect(within(plan).getByTestId('plan-files')).toHaveTextContent(
      'configmap-values.yaml.patch — create',
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

    const commit = within(dialog()).getByRole('button', { name: 'Commit' });
    expect(commit).toBeEnabled();
    await userEvent.click(commit);
    await waitFor(() =>
      expect(within(dialog()).getByTestId('committed')).toBeInTheDocument(),
    );
    expect(api.writes[1]).toMatchObject({ options: { mode: 'commit' } });
    expect(
      within(dialog()).getByTestId('action-pull-requests'),
    ).toHaveTextContent('example/example-configs#7 — open');
  });

  it('disables Commit without the manager grant', async () => {
    await render('rowan', {
      connection: { connected: false, authUrl: 'https://muster.test/connect' },
    });
    await openReview();
    expect(
      within(dialog()).getByRole('button', { name: 'Commit' }),
    ).toBeDisabled();
    expect(within(dialog()).getByText('Commit needs your grant')).toBeVisible();
  });

  it('an installation not opted in shows the file path and the pull request, and no Commit', async () => {
    const api = await render('alder', {
      installations: [NOT_OPTED_IN],
      plan: {
        ...(await new FakeApi().enableCapability(
          'alder',
          'agent-platform',
          {},
          { dryRun: true },
        )),
        installations: [
          {
            name: 'alder',
            state: 'not opted in',
            optIn: NOT_OPTED_IN.optIn,
            commitRefused:
              'alder is not opted in: no management-clusters/alder/platform-manager.yaml',
            files: [],
          },
        ],
        pullRequests: [],
      },
    });
    const card = screen.getByTestId('capability-agent-platform');
    expect(within(card).getByTestId('capability-state')).toHaveTextContent(
      'not opted in',
    );
    const note = within(card).getByTestId('opt-in-note');
    expect(note).toHaveTextContent(
      'management-clusters/alder/platform-manager.yaml',
    );
    expect(
      within(note).getByRole('link', { name: 'The pull request that adds it' }),
    ).toHaveAttribute('href', NOT_OPTED_IN.optIn.howToOptIn);

    await openReview();
    expect(
      within(dialog()).getByText('A commit would be refused'),
    ).toBeVisible();
    expect(
      within(dialog()).queryByRole('button', { name: 'Commit' }),
    ).toBeNull();
    expect(api.writes).toHaveLength(1);
  });

  it('Verify runs the check and shows the features with their marks', async () => {
    const api = await render('rowan');
    await userEvent.click(screen.getByRole('button', { name: 'Verify' }));
    await waitFor(() =>
      expect(screen.getByTestId('verify-result')).toBeInTheDocument(),
    );
    expect(api.verified).toBe(1);
    expect(screen.getByTestId('verify-state')).toHaveTextContent('drifted');
    expect(screen.getByTestId('feature-identity')).toHaveTextContent(
      'as defined',
    );
    expect(screen.getByTestId('feature-runtime')).toHaveTextContent(
      'kagent.replicas',
    );
  });
});
