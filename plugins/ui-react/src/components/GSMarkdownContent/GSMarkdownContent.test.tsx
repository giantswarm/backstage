import { render, screen } from '@testing-library/react';
import { GSMarkdownContent } from './GSMarkdownContent';

describe('GSMarkdownContent', () => {
  it('renders markdown content', () => {
    render(<GSMarkdownContent content={'# Heading\n\nA paragraph of text.'} />);

    expect(
      screen.getByRole('heading', { name: 'Heading' }),
    ).toBeInTheDocument();
    expect(screen.getByText('A paragraph of text.')).toBeInTheDocument();
  });

  it('renders GFM tables by default', () => {
    render(<GSMarkdownContent content={'| a | b |\n| - | - |\n| 1 | 2 |'} />);

    // GFM table syntax produces a real <table> only when the gfm dialect is
    // active, which is the default for this component.
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'a' })).toBeInTheDocument();
  });

  it('applies a caller-provided className to the wrapper', () => {
    const { container } = render(
      <GSMarkdownContent content="text" className="custom-class" />,
    );

    expect(container.querySelector('.custom-class')).toBeInTheDocument();
  });
});
