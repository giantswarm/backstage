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
  NOT_ENABLED,
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

/** The layout box of a cell's mark or skeleton: what decides the row's height. */
const box = (el: HTMLElement) =>
  ['display', 'width', 'height', 'alignItems'].map(
    property => el.style[property as 'display'],
  );

describe('useInstallationCapabilityColumns', () => {
  beforeEach(() => platformCapabilitiesQueryClient.clear());

  it('has its columns on the first render, before the manager has answered anything', async () => {
    const api = new FakeApi({
      installations: [ENABLED],
      definitions: [
        AGENT_PLATFORM_DEFINITION,
        { ...AGENT_PLATFORM_DEFINITION, name: 'customer-portal' },
      ],
      infoLatency: 400,
      latency: 800,
    });
    await renderInTestApp(
      <TestApiProvider apis={[[platformCapabilitiesApiRef, api]]}>
        <Probe names={['birch']} />
      </TestApiProvider>,
    );
    // No waiting: the platform's capabilities are the columns of the first
    // render, each cell a skeleton, with neither `get_info` nor the listing in.
    expect(screen.getByTestId('titles')).toHaveTextContent(
      'agent-platform,customer-portal',
    );
    expect(screen.getByTestId('widths')).toHaveTextContent('120px,120px');
    expect(
      screen.getByTestId('capability-agent-platform-birch-pending'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('capability-customer-portal-birch-pending'),
    ).toBeInTheDocument();
    // The definitions confirm the set; the listing brings the icons.
    await waitFor(
      () =>
        expect(
          screen.getByTestId('capability-agent-platform-birch'),
        ).toHaveAttribute('data-mark', 'in sync'),
      { timeout: 3000 },
    );
    expect(screen.getByTestId('titles')).toHaveTextContent(
      'agent-platform,customer-portal',
    );
  });

  it("takes the manager's set once it answers, in name order whatever the source's", async () => {
    const api = new FakeApi({
      installations: [ENABLED],
      definitions: [
        { ...AGENT_PLATFORM_DEFINITION, name: 'observability' },
        { ...AGENT_PLATFORM_DEFINITION, name: 'customer-portal' },
        AGENT_PLATFORM_DEFINITION,
      ],
      latency: 400,
    });
    await renderInTestApp(
      <TestApiProvider apis={[[platformCapabilitiesApiRef, api]]}>
        <Probe names={['birch']} />
      </TestApiProvider>,
    );
    // A definition the plugin does not know joins the columns, in name order.
    await waitFor(() =>
      expect(screen.getByTestId('titles')).toHaveTextContent(
        'agent-platform,customer-portal,observability',
      ),
    );
    expect(
      screen.getByTestId('capability-observability-birch-pending'),
    ).toBeInTheDocument();
    // The listing names the same set: the columns stay where they are.
    await waitFor(
      () =>
        expect(
          screen.getByTestId('capability-agent-platform-birch'),
        ).toHaveAttribute('data-mark', 'in sync'),
      { timeout: 3000 },
    );
    expect(screen.getByTestId('titles')).toHaveTextContent(
      'agent-platform,customer-portal,observability',
    );
    expect(
      screen.getByTestId('capability-observability-birch'),
    ).toHaveTextContent('—');
  });

  it('adds one column per capability with one icon per installation', async () => {
    const api = new FakeApi({
      installations: [
        installation(),
        NOT_ENABLED,
        ENABLED,
        ENABLED_BY_HAND,
        DRIFTED,
      ],
    });
    await renderInTestApp(
      <TestApiProvider apis={[[platformCapabilitiesApiRef, api]]}>
        <Probe
          names={[
            'rowan',
            'alder',
            'birch',
            'cedar',
            'maple',
            'elm',
            'unknown-one',
          ]}
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
    expect(cell('alder')).toHaveAttribute('data-state', 'not enabled');
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

  it("has its columns before the listing arrives, each cell a skeleton in the icon's box", async () => {
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
    const pending = screen.getByTestId(
      'capability-agent-platform-birch-pending',
    );
    expect(pending).toHaveAttribute('aria-busy', 'true');
    const pendingBox = box(pending);
    expect(screen.queryByTestId('capability-agent-platform-birch')).toBeNull();
    // Then the icons.
    await waitFor(
      () =>
        expect(
          screen.getByTestId('capability-agent-platform-birch'),
        ).toHaveAttribute('data-mark', 'in sync'),
      { timeout: 3000 },
    );
    // In the box the skeleton held, so the row is as tall as before.
    expect(box(screen.getByTestId('capability-agent-platform-birch'))).toEqual(
      pendingBox,
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
