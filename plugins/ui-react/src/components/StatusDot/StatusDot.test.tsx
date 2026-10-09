import { render, screen } from '@testing-library/react';
import { StatusDot } from './StatusDot';

describe('StatusDot', () => {
  it('renders the label next to a decorative dot', () => {
    const { container } = render(<StatusDot tone="info" label="Working" />);

    expect(screen.getByText('Working')).toBeInTheDocument();
    const dot = container.querySelector('[data-tone="info"]');
    expect(dot).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('names a dot without a label for assistive technology', () => {
    render(<StatusDot tone="warning" aria-label="Waiting for you" />);

    const dot = screen.getByRole('img', { name: 'Waiting for you' });
    expect(dot).toHaveAttribute('title', 'Waiting for you');
  });

  it('hides a dot with neither label nor name', () => {
    const { container } = render(<StatusDot tone="neutral" />);

    expect(container.querySelector('[data-tone="neutral"]')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
  });

  it('reads the tone colour from the shared state-dot variable first', () => {
    const { container } = render(<StatusDot tone="danger" size={6} />);

    const dot = container.querySelector<HTMLElement>('[data-tone="danger"]');
    expect(dot?.style.backgroundColor).toMatch(
      /^var\(--agent-platform-state-dot-danger, /,
    );
    expect(dot?.style.width).toBe('6px');
  });
});
