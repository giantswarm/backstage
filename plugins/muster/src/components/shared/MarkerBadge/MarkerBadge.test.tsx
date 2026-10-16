import { render, screen } from '@testing-library/react';
import { MarkerBadge } from './MarkerBadge';

describe('MarkerBadge', () => {
  it('draws its words as a small bui badge', () => {
    render(<MarkerBadge tone="neutral">May fail</MarkerBadge>);
    const badge = screen.getByText('May fail');
    expect(badge).toHaveClass('bui-Badge');
    expect(badge).toHaveAttribute('data-size', 'small');
  });

  it('sets a warning apart from a neutral marker', () => {
    render(
      <>
        <MarkerBadge tone="neutral">Plain</MarkerBadge>
        <MarkerBadge tone="warning">Weigh this</MarkerBadge>
      </>,
    );
    expect(screen.getByText('Weigh this').className).not.toBe(
      screen.getByText('Plain').className,
    );
  });

  it("keeps a caller's class beside its own", () => {
    render(
      <MarkerBadge tone="neutral" className="compact">
        May fail
      </MarkerBadge>,
    );
    const badge = screen.getByText('May fail');
    expect(badge).toHaveClass('bui-Badge', 'compact');
    expect(badge.classList.length).toBeGreaterThan(2);
  });
});
