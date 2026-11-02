import { applyCatalogFilters } from './catalogFilters';
import { tagsFacet } from './tagsFacet';

describe('tagsFacet', () => {
  it('keeps the items carrying any picked tag', () => {
    const items = [
      { name: 'a', tags: ['util', 'ops'] },
      { name: 'b', tags: ['marketing'] },
      { name: 'c', tags: [] },
    ];
    const facet = tagsFacet((item: (typeof items)[number]) => item.tags);

    expect(facet).toMatchObject({ id: 'tags', label: 'Tags' });
    expect(
      applyCatalogFilters(items, [facet], { tags: ['ops', 'marketing'] }).map(
        item => item.name,
      ),
    ).toEqual(['a', 'b']);
  });
});
