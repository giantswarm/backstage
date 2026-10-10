import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ShowMore } from './ShowMore';

const names = Array.from({ length: 23 }, (_, i) => `Agent ${i + 1}`);

function renderList(props: { revealAll?: boolean; items?: string[] } = {}) {
  return render(
    <ShowMore
      items={props.items ?? names}
      initial={10}
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

  it('offers nothing for a list that fits', () => {
    renderList({ items: names.slice(0, 10) });
    expect(rendered()).toBe(10);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
