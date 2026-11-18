import { render, screen, within } from '@testing-library/react';
import { FactsColumn } from './FactsColumn';

describe('FactsColumn', () => {
  it('lists each fact as a term and its value in a named column', () => {
    render(
      <FactsColumn
        facts={[
          { label: 'Sign-in', value: 'Company login' },
          { label: 'Calls this month', value: 3418 },
        ]}
      >
        <a href="/edit">Edit</a>
      </FactsColumn>,
    );

    const column = screen.getByRole('complementary', { name: 'Details' });
    expect(
      within(column)
        .getAllByRole('term')
        .map(term => term.textContent),
    ).toEqual(['Sign-in', 'Calls this month']);
    expect(
      within(column)
        .getAllByRole('definition')
        .map(value => value.textContent),
    ).toEqual(['Company login', '3418']);
    expect(within(column).getByRole('link', { name: 'Edit' })).toBeVisible();
  });

  it('takes a name for its landmark', () => {
    render(<FactsColumn facts={[]} aria-label="About this connector" />);

    expect(
      screen.getByRole('complementary', { name: 'About this connector' }),
    ).toBeInTheDocument();
  });

  it("sets bui's 10px size to 12px for what its values render", () => {
    render(<FactsColumn facts={[{ label: 'Model', value: 'gpt-4.1-mini' }]} />);

    expect(
      getComputedStyle(screen.getByRole('complementary')).getPropertyValue(
        '--bui-font-size-1',
      ),
    ).toBe('var(--bui-font-size-2)');
  });
});
