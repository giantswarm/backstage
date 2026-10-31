import { useMemo } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CatalogFilterBar, CatalogNoMatch } from './CatalogFilterBar';
import type { CatalogFacet } from './catalogFilters';
import { useCatalogFilters } from './useCatalogFilters';

type Item = { name: string; provider: string; tier?: string };

function Catalog({ items }: { items: Item[] }) {
  const facets = useMemo<CatalogFacet<Item>[]>(
    () => [
      { id: 'provider', label: 'Provider', value: item => item.provider },
      { id: 'tier', label: 'Tier', value: item => item.tier },
    ],
    [],
  );
  const filters = useCatalogFilters({ items, searched: items, facets });
  return (
    <>
      <CatalogFilterBar
        dimensions={filters.dimensions}
        onSelect={filters.select}
        onClear={filters.clear}
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

// `hidden`: readable while its own list is open over the page.
const dropdown = (name: string) =>
  screen.getByRole('button', {
    name: new RegExp(`Filter by ${name}`),
    hidden: true,
  });

/** Opens a facet's dropdown and reads its options, as "label count". */
async function openOptions(name: string) {
  await userEvent.click(dropdown(name));
  const listbox = await screen.findByRole('listbox');
  return within(listbox)
    .getAllByRole('option')
    .map(option => option.textContent);
}

const pick = async (option: string) =>
  userEvent.click(await screen.findByRole('option', { name: option }));

const shown = () =>
  // Hidden from the accessibility tree while a dropdown's list is open.
  within(screen.getByRole('list', { name: 'Models', hidden: true }))
    .getAllByRole('listitem', { hidden: true })
    .map(item => item.textContent);

describe('CatalogFilterBar', () => {
  it('draws nothing when no facet has two options to choose from', () => {
    render(
      <Catalog
        items={[
          { name: 'a', provider: 'OpenAI' },
          { name: 'b', provider: 'OpenAI' },
          { name: 'c', provider: 'OpenAI' },
        ]}
      />,
    );
    // One provider for all, and no item has a tier: nothing to choose.
    expect(screen.queryByRole('group', { name: 'Filters' })).toBeNull();
    expect(shown()).toEqual(['a', 'b', 'c']);
  });

  it('picks several values of a facet over three entries, and unpicks them', async () => {
    render(
      <Catalog
        items={[
          { name: 'a', provider: 'OpenAI' },
          { name: 'b', provider: 'Anthropic' },
          { name: 'c', provider: 'Bedrock' },
          { name: 'd', provider: 'OpenAI' },
        ]}
      />,
    );
    expect(await openOptions('provider')).toEqual([
      'OpenAI 2',
      'Anthropic 1',
      'Bedrock 1',
    ]);

    await pick('Anthropic 1');
    expect(shown()).toEqual(['b']);
    // The list stays open for a second pick, which widens the list.
    await pick('Bedrock 1');
    expect(shown()).toEqual(['b', 'c']);
    expect(dropdown('provider')).toHaveTextContent('Provider 2');
    expect(dropdown('provider')).toHaveTextContent('Anthropic and Bedrock');

    await pick('Anthropic 1');
    await pick('Bedrock 1');
    expect(shown()).toEqual(['a', 'b', 'c', 'd']);
    expect(dropdown('provider')).toHaveTextContent('ProviderAll');
  });

  it('counts, narrows across facets and clears at 300 entries', async () => {
    const items = Array.from({ length: 300 }, (_, index) => ({
      name: `m-${index}`,
      provider: `Provider ${index % 10}`,
      tier: index % 3 === 0 ? 'Premium' : 'Standard',
    }));
    render(<Catalog items={items} />);

    const providers = await openOptions('provider');
    expect(providers).toHaveLength(10);
    expect(providers[0]).toBe('Provider 0 30');
    // Ten values: the dropdown has a search of its own.
    expect(
      screen.getByRole('searchbox', { name: 'Search provider' }),
    ).toBeInTheDocument();

    await pick('Provider 0 30');
    await pick('Provider 1 30');
    expect(shown()).toHaveLength(60);
    await userEvent.keyboard('{Escape}');

    // The tier counts follow the provider picks: 0, 3, 6, … of 0 and 1 mod 10.
    expect(await openOptions('tier')).toEqual(['Standard 40', 'Premium 20']);
    await pick('Premium 20');
    expect(shown()).toHaveLength(20);
    await userEvent.keyboard('{Escape}');

    // And the provider counts follow the tier pick.
    expect((await openOptions('provider')).slice(0, 2)).toEqual([
      'Provider 0 10',
      'Provider 1 10',
    ]);
    await userEvent.keyboard('{Escape}');

    await userEvent.click(
      within(screen.getByRole('group', { name: 'Filters' })).getByRole(
        'button',
        { name: 'Clear filters' },
      ),
    );
    expect(shown()).toHaveLength(300);
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull();
  });

  it('wraps its dropdowns itself, without the shell’s stylesheet', () => {
    render(
      <Catalog
        items={[
          { name: 'a', provider: 'OpenAI', tier: 'Premium' },
          { name: 'b', provider: 'Anthropic', tier: 'Standard' },
        ]}
      />,
    );
    expect(screen.getByRole('group', { name: 'Filters' })).toHaveStyle({
      flexWrap: 'wrap',
    });
  });

  it('offers the empty state’s way back when the picks empty the list', async () => {
    function Emptied() {
      const facets = useMemo<CatalogFacet<Item>[]>(
        () => [{ id: 'provider', label: 'Provider', value: i => i.provider }],
        [],
      );
      const items = useMemo(
        () => [
          { name: 'a', provider: 'OpenAI' },
          { name: 'b', provider: 'Anthropic' },
        ],
        [],
      );
      // Searched to nothing: a pick can still be made, and undone.
      const filters = useCatalogFilters({ items, searched: [], facets });
      return (
        <>
          <CatalogFilterBar
            dimensions={filters.dimensions}
            onSelect={filters.select}
          />
          <CatalogNoMatch
            plural="models"
            search="x"
            isFiltered={filters.isFiltered}
            onClearFilters={filters.clear}
          />
        </>
      );
    }
    render(<Emptied />);
    expect(await openOptions('provider')).toEqual(['Anthropic 0', 'OpenAI 0']);
    await pick('OpenAI 0');
    await userEvent.keyboard('{Escape}');
    await userEvent.click(
      screen.getByRole('button', { name: 'Clear filters' }),
    );
    expect(dropdown('provider')).toHaveTextContent('ProviderAll');
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
