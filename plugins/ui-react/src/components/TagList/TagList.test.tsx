import { render, screen, within } from '@testing-library/react';

import { TagList } from './TagList';

describe('TagList', () => {
  it('lists every tag, each whole in its tooltip', () => {
    const long = `${'a'.repeat(30)}-${'b'.repeat(32)}`;
    render(<TagList tags={['util', long]} />);

    const items = within(
      screen.getByRole('list', { name: 'Tags' }),
    ).getAllByRole('listitem');
    expect(items.map(item => item.textContent)).toEqual(['util', long]);
    expect(screen.getByText(long).parentElement).toHaveAttribute('title', long);
  });

  it('counts the rest past max', () => {
    render(<TagList tags={['a', 'b', 'c']} max={1} />);

    expect(screen.getByText('2 more tags')).toBeInTheDocument();
    expect(screen.getByText('+2')).toHaveAttribute('aria-hidden');
  });

  it('draws nothing without tags', () => {
    const { container } = render(<TagList tags={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
