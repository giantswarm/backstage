import { renderInTestApp } from '@backstage/frontend-test-utils';
import { TestApiProvider } from '@backstage/test-utils';
import { EntityProvider } from '@backstage/plugin-catalog-react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { platformCapabilitiesApiRef } from '../apis';
import {
  ACTION,
  ENABLED,
  FakeApi,
  FakeOptions,
  NOT_ENABLED,
  REFUSED_ACTION,
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
      'Installed · 2 checks differ',
    );
    expect(
      within(card).getByTestId('choice-modelServing.enabled'),
    ).toHaveTextContent('off');
    expect(within(card).getByTestId('feature-secrets')).toHaveTextContent(
      'Secrets — 1 check differs',
    );
    expect(
      within(card).getByRole('button', { name: 'Apply changes' }),
    ).toBeEnabled();
    expect(within(card).queryByRole('button', { name: 'Verify' })).toBeNull();
    expect(api.verifies).toHaveLength(1);
    const history = screen.getByRole('region', { name: 'Action history' });
    expect(
      await within(history).findByTestId(`history-${ACTION.name}`),
    ).toHaveTextContent(
      /^enable agent-platform by someone · Pending approval · .+ ago/,
    );
    // birch's last action is not in this listing, so the line has no date.
    expect(within(card).getByTestId('last-action')).toHaveTextContent(
      /^Last action: enable agent-platform · Installed$/,
    );
  });

  it('a refused action reads Refused in the history, with what it asked for', async () => {
    await render('rowan', { actions: [REFUSED_ACTION] });
    const history = screen.getByRole('region', { name: 'Action history' });
    const entry = await within(history).findByTestId(
      `history-${REFUSED_ACTION.name}`,
    );
    expect(within(entry).getByTestId('action-line')).toHaveTextContent(
      /^enable agent-platform by someone · Refused · .+ ago$/,
    );
    await userEvent.click(within(entry).getByTestId('action-line'));
    expect(within(entry).getByTestId('action-inputs')).toHaveTextContent(
      'Chart line3',
    );
    expect(screen.getByTestId('capability-agent-platform')).toHaveTextContent(
      'No action yet',
    );
  });

  it('Enable opens the form from the definition schema, prefilled from the comparison, reviews with its values, then opens the pull requests', async () => {
    const api = await render('rowan');
    await userEvent.click(screen.getByRole('button', { name: 'Enable' }));
    const form = dialog();
    // The person's choices as the schema groups them, named by their groups
    // (no control reads `enabled`); the record's facts are not asked.
    expect(within(form).getByTestId('group-kagent')).toBeInTheDocument();
    expect(within(form).queryByLabelText(/base domain/i)).toBeNull();
    expect(within(form).queryAllByText('enabled')).toHaveLength(0);
    const choice = (label: string) =>
      within(form).getByRole('button', { name: n => n.endsWith(` ${label}`) });
    // Kagent and Model serving are on record (the comparison read them
    // back), Portal is not.
    expect(choice('Kagent')).toHaveTextContent('yes');
    expect(choice('Portal')).toHaveTextContent('Choose…');
    expect(choice('Model serving')).toHaveTextContent('no');
    expect(within(form).getByTestId('missing-required')).toHaveTextContent(
      /Required, not chosen yet:\s*Portal$/,
    );
    await userEvent.click(choice('Portal'));
    await userEvent.click(screen.getByRole('option', { name: 'yes' }));
    expect(within(form).queryByTestId('missing-required')).toBeNull();

    await userEvent.click(within(form).getByRole('button', { name: 'Review' }));
    await waitFor(() =>
      expect(within(dialog()).getByTestId('plan')).toBeInTheDocument(),
    );
    // The review is the comparison with the form's values -- the choices,
    // nothing the manager reads itself; nothing is written.
    expect(api.writes).toHaveLength(0);
    expect(api.verifies[1]).toMatchObject({
      installation: 'rowan',
      capability: 'agent-platform',
      args: {
        inputs: {
          kagent: { enabled: true },
          portal: { enabled: true },
          modelServing: { enabled: false },
        },
      },
    });
    expect(api.verifies[1].args?.inputs).not.toHaveProperty('installation');

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
      'Runtime — 1 check differs',
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
      args: {
        inputs: {
          kagent: { enabled: true },
          portal: { enabled: true },
          modelServing: { enabled: false },
        },
      },
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

  it('shows the indicator while the installation loads', async () => {
    const api = new FakeApi({ installations: [ENABLED], latency: 400 });
    await renderInTestApp(
      <TestApiProvider apis={[[platformCapabilitiesApiRef, api]]}>
        <EntityProvider entity={entityOf('birch')}>
          <EntityCapabilitiesContent />
        </EntityProvider>
      </TestApiProvider>,
    );
    expect(
      await within(screen.getByTestId('loading')).findByRole('progressbar', {
        name: 'Loading capabilities…',
      }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByTestId('capability-agent-platform'),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByTestId('loading')).toBeNull();
  });

  it('an installation with nothing on record offers Enable', async () => {
    await render('alder', { installations: [NOT_ENABLED] });
    const card = screen.getByTestId('capability-agent-platform');
    expect(within(card).getByTestId('capability-state')).toHaveTextContent(
      'Not installed',
    );
    expect(within(card).getByRole('button', { name: 'Enable' })).toBeEnabled();
  });
});
