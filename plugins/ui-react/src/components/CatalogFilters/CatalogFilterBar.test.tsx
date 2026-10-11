import { useMemo } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CatalogFilterBar, CatalogNoMatch } from './CatalogFilterBar';
import type { CatalogFacet } from './catalogFilters';
import { useCatalogFilters } from './useCatalogFilters';

type Item = { name: string; provider: string };

function Catalog({ items }: { items: Item[] }) {
  const facets = useMemo<CatalogFacet<Item>[]>(
    () => [{ id: 'provider', label: 'Provider', value: item => item.provider }],
    [],
  );
  const filters = useCatalogFilters({ items, searched: items, facets });
  return (
    <>
      <CatalogFilterBar
        dimensions={filters.dimensions}
        onSelect={filters.select}
      />
      {filters.filtered.length === 0 ? (
        <CatalogNoMatch
          plural="models"
          search=""
          isFiltered={filters.isFiltered}
          onClearFilters={filters.clear}
        />
      ) : (
        <ul aria-label="Models">
          {filters.filtered.map(item => (
            <li key={item.name}>{item.name}</li>
          ))}
        </ul>
      )}
    </>
  );
}

const chips = (name: string) =>
  within(screen.getByRole('radiogroup', { name }))
    .getAllByRole('radio')
    .map(chip => chip.textContent);

const shown = () =>
  within(screen.getByRole('list', { name: 'Models' }))
    .getAllByRole('listitem')
    .map(item => item.textContent);

describe('CatalogFilterBar', () => {
  it('draws nothing over three entries of one provider', () => {
    render(
      <Catalog
        items={[
          { name: 'a', provider: 'OpenAI' },
          { name: 'b', provider: 'OpenAI' },
          { name: 'c', provider: 'OpenAI' },
        ]}
      />,
    );
    expect(screen.queryByRole('group', { name: 'Filters' })).toBeNull();
    expect(shown()).toEqual(['a', 'b', 'c']);
  });

  it('draws chips over three entries that differ, and filters by them', async () => {
    render(
      <Catalog
        items={[
          { name: 'a', provider: 'OpenAI' },
          { name: 'b', provider: 'Anthropic' },
          { name: 'c', provider: 'OpenAI' },
        ]}
      />,
    );
    expect(chips('Filter by provider')).toEqual([
      'All 3',
      'OpenAI 2',
      'Anthropic 1',
    ]);

    await userEvent.click(screen.getByRole('radio', { name: 'Anthropic 1' }));
    expect(shown()).toEqual(['b']);

    await userEvent.click(screen.getByRole('radio', { name: 'All 3' }));
    expect(shown()).toEqual(['a', 'b', 'c']);
  });

  it('wraps its chips itself, without the shell’s stylesheet', () => {
    // Six providers with counts are wider than a phone's 343px.
    const providers = [
      'OpenAI',
      'Anthropic',
      'Azure OpenAI',
      'Bedrock',
      'Self-hosted',
      'Vertex',
    ];
    render(
      <Catalog
        items={providers.map((provider, index) => ({
          name: `m-${index}`,
          provider,
        }))}
      />,
    );

    expect(
      screen.getByRole('radiogroup', { name: 'Filter by provider' }),
    ).toHaveStyle({ flexWrap: 'wrap', overflow: 'visible' });
    expect(chips('Filter by provider')).toHaveLength(7);
  });

  it('turns a facet of many values into a select at 300 entries', async () => {
    const items = Array.from({ length: 300 }, (_, index) => ({
      name: `m-${index}`,
      provider: `Provider ${index % 10}`,
    }));
    render(<Catalog items={items} />);

    expect(screen.queryByRole('radiogroup')).toBeNull();
    const select = screen.getByRole('button', { name: /Filter by provider/ });
    expect(select).toHaveTextContent('All (300)');
  });
});

describe('CatalogNoMatch', () => {
  it('names the search and the filters, and clears the filters', async () => {
    const onClearFilters = jest.fn();
    const { rerender } = render(
      <CatalogNoMatch
        plural="agents"
        search=" ops "
        isFiltered
        onClearFilters={onClearFilters}
      />,
    );
    expect(
      screen.getByText('No agents match “ops” with these filters.'),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Clear filters' }),
    );
    expect(onClearFilters).toHaveBeenCalled();

    rerender(
      <CatalogNoMatch
        plural="agents"
        search="ops"
        isFiltered={false}
        onClearFilters={onClearFilters}
      />,
    );
    expect(screen.getByText('No agents match “ops”.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull();
  });
});
