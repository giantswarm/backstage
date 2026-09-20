import { renderInTestApp } from '@backstage/frontend-test-utils';
import { TestApiProvider } from '@backstage/test-utils';
import { CatalogTableRow } from '@backstage/plugin-catalog';
import { screen, waitFor } from '@testing-library/react';
import { platformCapabilitiesApiRef } from '../apis';
import {
  AGENT_PLATFORM_DEFINITION,
  DRIFTED,
  ENABLED,
  ENABLED_BY_HAND,
  FakeApi,
  installation,
  NOT_OPTED_IN,
} from '../fixtures/fakeApi';
import { useInstallationCapabilityColumns } from './columns';
import { platformCapabilitiesQueryClient } from './Providers';

const row = (name: string) =>
  ({
    entity: {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Resource',
      metadata: { name },
      spec: { type: 'installation' },
    },
  }) as unknown as CatalogTableRow;

function Probe({ names }: { names: string[] }) {
  const { columns, notice } = useInstallationCapabilityColumns();
  return (
    <div>
      {notice}
      <div data-testid="titles">
        {columns.map(c => String(c.title)).join(',')}
      </div>
      <div data-testid="widths">{columns.map(c => c.width).join(',')}</div>
      {names.map(name => (
        <div key={name} data-testid={`row-${name}`}>
          {columns.map(c => (
            <span key={String(c.title)}>{c.render?.(row(name), 'row')}</span>
          ))}
        </div>
      ))}
    </div>
  );
}

describe('useInstallationCapabilityColumns', () => {
  beforeEach(() => platformCapabilitiesQueryClient.clear());

  it('adds one column per capability with one icon per installation', async () => {
    const api = new FakeApi({
      installations: [
        installation(),
        NOT_OPTED_IN,
        ENABLED,
        ENABLED_BY_HAND,
        DRIFTED,
      ],
    });
    await renderInTestApp(
      <TestApiProvider apis={[[platformCapabilitiesApiRef, api]]}>
        <Probe
          names={['rowan', 'alder', 'birch', 'cedar', 'elm', 'unknown-one']}
        />
      </TestApiProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId('titles')).toHaveTextContent('agent-platform'),
    );
    const cell = (name: string) =>
      screen.getByTestId(`capability-agent-platform-${name}`);
    await waitFor(() =>
      expect(cell('rowan')).toHaveAttribute('data-state', 'not enabled'),
    );
    // The cell is the icon: the state is its name and its attribute, not text.
    expect(cell('rowan')).toHaveAttribute('data-mark', 'not installed');
    expect(cell('rowan')).toHaveAccessibleName('Not installed');
    expect(cell('rowan')).toHaveTextContent('');
    expect(cell('alder')).toHaveAttribute('data-state', 'not opted in');
    expect(cell('alder')).toHaveAttribute('data-mark', 'not installed');
    // Enabled and verified by the manager's last action: in sync.
    expect(cell('birch')).toHaveAttribute('data-state', 'enabled');
    expect(cell('birch')).toHaveAttribute('data-mark', 'in sync');
    // Enabled by hand, no action on record: installed, not reconciled.
    expect(cell('cedar')).toHaveAttribute('data-state', 'enabled');
    expect(cell('cedar')).toHaveAttribute('data-mark', 'not reconciled');
    expect(cell('elm')).toHaveAttribute('data-state', 'drifted');
    expect(cell('elm')).toHaveAttribute('data-mark', 'not in sync');
    expect(cell('elm')).toHaveAccessibleName('Installed · differences');
    // The listing alone decides the icon: no comparison runs on this page.
    expect(api.verifies).toHaveLength(0);
    expect(cell('unknown-one')).toHaveTextContent('—');
    // The columns ask for the states alone: the manager reads a third of the fleet.
    expect(api.listFilters).toEqual([{ summary: true }]);
  });

  it('has its columns from the definitions before the listing arrives, each cell a skeleton', async () => {
    const api = new FakeApi({
      installations: [ENABLED],
      definitions: [
        AGENT_PLATFORM_DEFINITION,
        { ...AGENT_PLATFORM_DEFINITION, name: 'customer-portal' },
      ],
      latency: 400,
    });
    await renderInTestApp(
      <TestApiProvider apis={[[platformCapabilitiesApiRef, api]]}>
        <Probe names={['birch']} />
      </TestApiProvider>,
    );
    // Both columns are there while the listing is still on its way.
    await waitFor(() =>
      expect(screen.getByTestId('titles')).toHaveTextContent(
        'agent-platform,customer-portal',
      ),
    );
    expect(
      screen.getByTestId('capability-customer-portal-birch-pending'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('capability-agent-platform-birch')).toBeNull();
    // Then the icons.
    await waitFor(
      () =>
        expect(
          screen.getByTestId('capability-agent-platform-birch'),
        ).toHaveAttribute('data-mark', 'in sync'),
      { timeout: 3000 },
    );
    expect(
      screen.queryByTestId('capability-customer-portal-birch-pending'),
    ).toBeNull();
    // Each column is as wide as one icon and its header, not a share of the table.
    expect(screen.getByTestId('widths')).toHaveTextContent('120px,120px');
  });

  it("shows the manager's error above the table and no state in the cells", async () => {
    const api = new FakeApi({ installations: [ENABLED] });
    api.listInstallations = async () => {
      const failure = new Error('the registry could not be read as you');
      failure.name = 'ForbiddenError';
      throw failure;
    };
    await renderInTestApp(
      <TestApiProvider apis={[[platformCapabilitiesApiRef, api]]}>
        <Probe names={['birch']} />
      </TestApiProvider>,
    );
    await waitFor(() =>
      expect(
        screen.getByText(/the registry could not be read as you/),
      ).toBeInTheDocument(),
    );
    // The definitions still name the columns; a cell says nothing.
    expect(screen.getByTestId('titles')).toHaveTextContent('agent-platform');
    expect(
      screen.getByTestId('capability-agent-platform-birch'),
    ).toHaveTextContent('');
    expect(
      screen.getByTestId('capability-agent-platform-birch'),
    ).not.toHaveAttribute('data-state');
  });

  it('adds nothing where the platform-capabilities api is not enabled', async () => {
    await renderInTestApp(
      <TestApiProvider apis={[]}>
        <Probe names={['rowan']} />
      </TestApiProvider>,
    );
    expect(screen.getByTestId('titles')).toHaveTextContent('');
    expect(screen.queryByTestId('capability-agent-platform-rowan')).toBeNull();
  });
});
