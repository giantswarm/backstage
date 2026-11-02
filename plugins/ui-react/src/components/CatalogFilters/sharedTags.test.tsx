import { type ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';

import {
  SharedTagsProvider,
  tagHref,
  tagsOfSearch,
  withTagsSearch,
} from './sharedTags';
import { tagsFacet } from './tagsFacet';
import { useCatalogFilters } from './useCatalogFilters';
import type { CatalogFacet } from './catalogFilters';

type Item = { kind: string; tags: string[] };

const ITEMS: Item[] = [
  { kind: 'a', tags: ['util'] },
  { kind: 'b', tags: ['ops'] },
];
const WITH_TAGS: CatalogFacet<Item>[] = [
  { id: 'kind', label: 'Kind', value: item => item.kind },
  tagsFacet<Item>(item => item.tags),
];
const WITHOUT_TAGS: CatalogFacet<Item>[] = [WITH_TAGS[0]];

describe('the tags query parameter', () => {
  it('reads the tags a query string picks', () => {
    expect(tagsOfSearch('?q=x&tags=util,ops,util')).toEqual(['util', 'ops']);
    expect(tagsOfSearch('?q=x')).toEqual([]);
  });

  it('sets or drops the tags, keeping the rest', () => {
    expect(withTagsSearch('?q=x', ['util', 'ops'])).toBe('?q=x&tags=util,ops');
    expect(withTagsSearch('?q=x&tags=util', [])).toBe('?q=x');
    expect(withTagsSearch('', [])).toBe('');
  });

  it('links a list with one tag picked', () => {
    expect(tagHref('/customize/agents', 'on-call')).toBe(
      '/customize/agents?tags=on-call',
    );
  });
});

describe('useCatalogFilters under a SharedTagsProvider', () => {
  function setup(
    facets: CatalogFacet<Item>[],
    tags: readonly string[],
    initialSelection?: Record<string, string[]>,
  ) {
    const onTagsChange = jest.fn();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <SharedTagsProvider tags={tags} onTagsChange={onTagsChange}>
        {children}
      </SharedTagsProvider>
    );
    const { result } = renderHook(
      () =>
        useCatalogFilters({
          items: ITEMS,
          searched: ITEMS,
          facets,
          initialSelection,
        }),
      { wrapper },
    );
    return { result, onTagsChange };
  }

  it('starts from the shared tags and writes its Tags picks back', () => {
    const { result, onTagsChange } = setup(WITH_TAGS, ['util']);
    expect(result.current.selection).toEqual({ tags: ['util'] });
    expect(result.current.filtered).toEqual([ITEMS[0]]);

    act(() => result.current.select('tags', ['ops']));
    expect(onTagsChange).toHaveBeenLastCalledWith(['ops']);
    act(() => result.current.select('kind', ['b']));
    expect(onTagsChange).toHaveBeenCalledTimes(1);
    act(() => result.current.clear());
    expect(onTagsChange).toHaveBeenLastCalledWith([]);
  });

  it('keeps tags its own initial selection picks', () => {
    const { result } = setup(WITH_TAGS, ['util'], { tags: ['ops'] });
    expect(result.current.selection).toEqual({ tags: ['ops'] });
  });

  it('leaves a catalog without a Tags facet alone', () => {
    const { result, onTagsChange } = setup(WITHOUT_TAGS, ['util']);
    expect(result.current.selection).toEqual({});
    act(() => result.current.clear());
    expect(onTagsChange).not.toHaveBeenCalled();
  });
});
