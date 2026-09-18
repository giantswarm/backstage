import { renderInTestApp } from '@backstage/frontend-test-utils';
import { TestApiProvider } from '@backstage/test-utils';
import { CatalogTableRow } from '@backstage/plugin-catalog';
import { screen, waitFor } from '@testing-library/react';
import { platformCapabilitiesApiRef } from '../apis';
import { FakeApi, installation, NOT_OPTED_IN } from '../fixtures/fakeApi';
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

  it('adds one column per capability with the state of each installation', async () => {
    const api = new FakeApi({
      installations: [installation(), NOT_OPTED_IN],
    });
    await renderInTestApp(
      <TestApiProvider apis={[[platformCapabilitiesApiRef, api]]}>
        <Probe names={['rowan', 'alder', 'unknown-one']} />
      </TestApiProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId('titles')).toHaveTextContent('agent-platform'),
    );
    await waitFor(() =>
      expect(
        screen.getByTestId('capability-agent-platform-rowan'),
      ).toHaveTextContent('not enabled'),
    );
    expect(
      screen.getByTestId('capability-agent-platform-alder'),
    ).toHaveTextContent('not opted in');
    expect(
      screen.getByTestId('capability-agent-platform-unknown-one'),
    ).toHaveTextContent('—');
    expect(api.listFilters).toEqual([{}]);
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
