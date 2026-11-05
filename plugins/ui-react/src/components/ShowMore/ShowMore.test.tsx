import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { isSearchableList, ShowMore } from './ShowMore';

const names = Array.from({ length: 23 }, (_, i) => `Agent ${i + 1}`);

function renderList(
  props: { revealAll?: boolean; items?: string[]; initial?: number } = {},
) {
  return render(
    <ShowMore
      items={props.items ?? names}
      initial={props.initial ?? 10}
      noun="agent"
      revealAll={props.revealAll}
    >
      {shown => (
        <ul aria-label="Agents">
          {shown.map(name => (
            <li key={name}>{name}</li>
          ))}
        </ul>
      )}
    </ShowMore>,
  );
}

const rendered = () => screen.getAllByRole('listitem').length;

describe('ShowMore', () => {
  it('reveals a page at a time, saying what is hidden, and folds back', async () => {
    renderList();
    expect(rendered()).toBe(10);
    expect(screen.getByText('10 agents shown, 13 more')).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: 'Show 10 more agents' }),
    );
    expect(rendered()).toBe(20);

    // The last page offers only what is left.
    await userEvent.click(
      screen.getByRole('button', { name: 'Show 3 more agents' }),
    );
    expect(rendered()).toBe(23);
    expect(screen.queryByRole('button', { name: /more/ })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Show fewer' }));
    expect(rendered()).toBe(10);
  });

  it('reveals everything in one press with revealAll', async () => {
    renderList({ revealAll: true });
    expect(rendered()).toBe(10);
    // The button names the total; there is no paging tally.
    expect(screen.queryByText(/shown/)).toBeNull();

    await userEvent.click(
      screen.getByRole('button', { name: 'Show all 23 agents' }),
    );
    expect(rendered()).toBe(23);
    expect(screen.queryByRole('button', { name: /Show all/ })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Show fewer' }));
    expect(rendered()).toBe(10);
  });

  describe('a remainder too small to page', () => {
    // Live round 2 (R9): 21 skills paged as 20 + "Show 1 more skill". A
    // remainder of up to a fifth of a page (never fewer than two) is shown
    // with the page before it.
    const many = (count: number) =>
      Array.from({ length: count }, (_, i) => `Agent ${i + 1}`);

    it('is shown with the first page rather than behind a button', () => {
      renderList({ items: many(21), initial: 20 });
      expect(rendered()).toBe(21);
      expect(screen.queryByRole('button')).toBeNull();
      expect(screen.queryByText(/shown/)).toBeNull();
    });

    it('stops at a fifth of the page: 24 of 20 shows whole, 25 pages', async () => {
      const { unmount } = renderList({ items: many(24), initial: 20 });
      expect(rendered()).toBe(24);
      expect(screen.queryByRole('button')).toBeNull();
      unmount();

      renderList({ items: many(25), initial: 20 });
      expect(rendered()).toBe(20);
      expect(
        screen.getByRole('button', { name: 'Show 5 more agents' }),
      ).toBeInTheDocument();
    });

    it('rides along with the page that reaches it, and the button says so', async () => {
      renderList({ items: many(44), initial: 20 });
      expect(rendered()).toBe(20);

      // 20 more would leave 4: the button offers all 24, and shows them.
      await userEvent.click(
        screen.getByRole('button', { name: 'Show 24 more agents' }),
      );
      expect(rendered()).toBe(44);
      expect(screen.queryByRole('button', { name: /more/ })).toBeNull();

      await userEvent.click(screen.getByRole('button', { name: 'Show fewer' }));
      expect(rendered()).toBe(20);
    });

    it('is shown with the excerpt in revealAll mode too', () => {
      // At the "Used by" excerpt's 10, the slack is two.
      const { unmount } = renderList({ items: many(12), revealAll: true });
      expect(rendered()).toBe(12);
      expect(screen.queryByRole('button')).toBeNull();
      unmount();

      renderList({ items: many(13), revealAll: true });
      expect(rendered()).toBe(10);
      expect(
        screen.getByRole('button', { name: 'Show all 13 agents' }),
      ).toBeInTheDocument();
    });
  });

  it('lets its controls wrap, so a phone’s 343px does not squeeze the tally', async () => {
    renderList({ items: Array.from({ length: 300 }, (_, i) => `Agent ${i}`) });
    await userEvent.click(
      screen.getByRole('button', { name: 'Show 10 more agents' }),
    );

    const controls = screen.getByRole('button', {
      name: 'Show fewer',
    }).parentElement!;
    expect(controls).toHaveStyle({ flexWrap: 'wrap' });
    expect(controls).toHaveTextContent('20 agents shown, 280 more');
  });

  it('offers nothing for a list that fits', () => {
    renderList({ items: names.slice(0, 10) });
    expect(rendered()).toBe(10);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('isSearchableList', () => {
  it('searches a list from three entries on', () => {
    expect(isSearchableList(0)).toBe(false);
    expect(isSearchableList(2)).toBe(false);
    expect(isSearchableList(3)).toBe(true);
    expect(isSearchableList(300)).toBe(true);
  });

  it('keeps the search while it or a filter narrows the list', () => {
    expect(isSearchableList(1, true)).toBe(true);
  });
});
