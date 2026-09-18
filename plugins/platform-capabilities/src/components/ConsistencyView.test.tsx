import { renderInTestApp } from '@backstage/frontend-test-utils';
import { TestApiProvider } from '@backstage/test-utils';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { platformCapabilitiesApiRef } from '../apis';
import {
  FakeApi,
  FakeOptions,
  installation,
  NOT_OPTED_IN,
  PROBES_DRIFTED,
  VERIFIED,
} from '../fixtures/fakeApi';
import { InstallationReadability } from './consistency';
import { ConsistencyView } from './ConsistencyView';
import { platformCapabilitiesQueryClient } from './Providers';

const FEATURES = [
  'identity',
  'secrets',
  'runtime',
  'tool-access',
  'federation',
  'portal',
];

async function render(
  options: FakeOptions = {},
  readability?: (installation: string) => InstallationReadability,
) {
  const api = new FakeApi({
    installations: [installation({ hub: true }), NOT_OPTED_IN],
    ...options,
  });
  const rendered = await renderInTestApp(
    <TestApiProvider apis={[[platformCapabilitiesApiRef, api]]}>
      <ConsistencyView capability="agent-platform" readability={readability} />
    </TestApiProvider>,
  );
  await waitFor(() =>
    expect(
      screen.getByTestId('consistency-cell-rowan-runtime'),
    ).toBeInTheDocument(),
  );
  return { api, ...rendered };
}

const cell = (name: string, feature: string) =>
  screen.getByTestId(`consistency-cell-${name}-${feature}`);

describe('ConsistencyView', () => {
  beforeEach(() => platformCapabilitiesQueryClient.clear());

  it('has one row per installation of the registry, one column per feature, and the marks of every cell', async () => {
    const { api } = await render();
    for (const feature of FEATURES) {
      expect(
        screen.getByTestId(`consistency-column-${feature}`),
      ).toBeInTheDocument();
    }
    expect(screen.getByTestId('consistency-row-rowan')).toHaveTextContent(
      'hub',
    );
    await waitFor(() =>
      expect(cell('alder', 'runtime')).toHaveAttribute('data-mark', 'drifted'),
    );
    expect(cell('rowan', 'identity')).toHaveAttribute(
      'data-mark',
      'as defined',
    );
    expect(cell('rowan', 'secrets')).toHaveAttribute(
      'data-mark',
      'differs by input',
    );
    expect(cell('rowan', 'runtime')).toHaveAttribute('data-mark', 'drifted');
    expect(cell('rowan', 'federation')).toHaveAttribute(
      'data-mark',
      'not checked',
    );
    // The comparison ran once per row when the view opened, opted in or not.
    expect(api.verifiedInstallations.sort()).toEqual(['alder', 'rowan']);
    expect(screen.getByTestId('consistency-summary')).toHaveTextContent(
      '2 installations, 2 compared',
    );
    // Nothing of the automation from here: no Enable, Reconcile or Commit.
    expect(
      screen.queryByRole('button', { name: /^(Enable|Reconcile|Commit)$/ }),
    ).toBeNull();
  });

  it('a cell expands to its dimensions and the difference, a row to its inputs', async () => {
    await render();
    await userEvent.click(cell('rowan', 'runtime'));
    const panel = screen.getByTestId('consistency-panel-rowan');
    expect(panel).toHaveTextContent('Runtime on rowan');
    const drifted = within(panel).getByTestId('dimension-patch-top-level-keys');
    expect(drifted).toHaveAttribute('data-mark', 'drifted');
    expect(drifted).toHaveTextContent(
      'configmap-values.yaml.patch kagent.replicas: rendered 1, current 2',
    );
    expect(within(panel).getByTestId('dimension-live-drift')).toHaveTextContent(
      "not checked: needs the person's authority",
    );

    await userEvent.click(cell('rowan', 'secrets'));
    expect(screen.getByTestId('consistency-panel-rowan')).toHaveTextContent(
      '(input installation.private)',
    );

    await userEvent.click(
      within(screen.getByTestId('consistency-row-rowan')).getByRole('button', {
        name: /^rowan/,
      }),
    );
    const inputs = within(
      screen.getByTestId('consistency-panel-rowan'),
    ).getByTestId('consistency-inputs');
    expect(inputs).toHaveTextContent(
      'installation.baseDomainrowan.example.test',
    );
    expect(inputs).toHaveTextContent('kagent.enabledtrue');
    expect(screen.getByTestId('consistency-panel-rowan')).toHaveTextContent(
      'Inputs on record: action enable-agent-platform-rowan-1',
    );

    // The same cell again closes the panel.
    await userEvent.click(cell('rowan', 'runtime'));
    await userEvent.click(cell('rowan', 'runtime'));
    expect(screen.queryByTestId('consistency-panel-rowan')).toBeNull();
  });

  it('Verify now runs the comparison again for that installation only, and the results are kept for the session', async () => {
    const { api, unmount } = await render();
    await waitFor(() => expect(api.verified).toBe(2));
    await userEvent.click(
      screen.getByRole('button', { name: 'Verify rowan now' }),
    );
    await waitFor(() => expect(api.verified).toBe(3));
    expect(api.verifiedInstallations.at(-1)).toBe('rowan');

    unmount();
    await renderInTestApp(
      <TestApiProvider apis={[[platformCapabilitiesApiRef, api]]}>
        <ConsistencyView capability="agent-platform" />
      </TestApiProvider>,
    );
    await waitFor(() =>
      expect(cell('rowan', 'runtime')).toHaveAttribute('data-mark', 'drifted'),
    );
    expect(api.verified).toBe(3);
  });

  it('a failed comparison shows the manager’s message in the row, the other rows their marks', async () => {
    await render({
      verifyErrors: { alder: new Error('alder: registry record not found') },
    });
    await waitFor(() =>
      expect(screen.getByTestId('consistency-error-alder')).toHaveTextContent(
        'Verify failed: alder: registry record not found',
      ),
    );
    expect(cell('rowan', 'runtime')).toHaveAttribute('data-mark', 'drifted');
  });

  it('a row the person may not read shows its probes as not readable, not as drift', async () => {
    await render(
      {
        verified: name =>
          name === 'alder'
            ? PROBES_DRIFTED
            : { ...VERIFIED, installation: name },
      },
      name =>
        name === 'alder'
          ? { state: 'not readable', reason: 'GET /apis: ForbiddenError' }
          : { state: 'readable' },
    );
    await waitFor(() =>
      expect(cell('alder', 'runtime')).toHaveAttribute(
        'data-mark',
        'as defined',
      ),
    );
    expect(
      screen.getByTestId('consistency-readability-alder'),
    ).toHaveTextContent('not readable');
    expect(screen.queryByTestId('consistency-readability-rowan')).toBeNull();
    // The manager marked identity drifted on its 403 probe; the files are as
    // defined, so that is what the person sees.
    expect(cell('alder', 'identity')).toHaveAttribute(
      'data-mark',
      'as defined',
    );
    // Tool access has nothing but the probe: not readable as a whole.
    expect(cell('alder', 'tool-access')).toHaveAttribute(
      'data-mark',
      'not readable',
    );
    await userEvent.click(cell('alder', 'identity'));
    const panel = screen.getByTestId('consistency-panel-alder');
    expect(
      within(panel).getByTestId('dimension-dex-auth-request'),
    ).toHaveAttribute('data-mark', 'not readable');
    expect(within(panel).getByTestId('dimension-dex-clients')).toHaveAttribute(
      'data-mark',
      'as defined',
    );
    // A readable installation's probes are shown as the manager marked them.
    expect(cell('rowan', 'tool-access')).toHaveAttribute(
      'data-mark',
      'as defined',
    );
  });

  it('names a capability the manager does not define', async () => {
    const api = new FakeApi();
    await renderInTestApp(
      <TestApiProvider apis={[[platformCapabilitiesApiRef, api]]}>
        <ConsistencyView capability="customer-portal" />
      </TestApiProvider>,
    );
    await waitFor(() =>
      expect(screen.getByText('No such capability')).toBeInTheDocument(),
    );
    expect(api.verified).toBe(0);
  });
});
