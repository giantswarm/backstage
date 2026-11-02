import { render, screen } from '@testing-library/react';
import { Badge } from '@backstage/ui';
import { MarkerBadge } from './MarkerBadge';

describe('MarkerBadge', () => {
  it('draws its words as a small bui badge', () => {
    render(<MarkerBadge tone="neutral">May fail</MarkerBadge>);
    const badge = screen.getByText('May fail');
    expect(badge).toHaveClass('bui-Badge');
    expect(badge).toHaveAttribute('data-size', 'small');
  });

  it('adds its own look to bui’s badge: text size and tone', () => {
    render(
      <>
        <Badge size="small">Plain bui</Badge>
        <MarkerBadge tone="neutral">May fail</MarkerBadge>
      </>,
    );
    const bui = screen.getByText('Plain bui').classList;
    const marker = screen.getByText('May fail').classList;
    expect(marker).toHaveLength(bui.length + 2);
    expect([...bui].every(name => marker.contains(name))).toBe(true);
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

  it('takes one more class for the compact size', () => {
    render(
      <>
        <MarkerBadge tone="neutral">Small</MarkerBadge>
        <MarkerBadge tone="neutral" size="compact">
          Compact
        </MarkerBadge>
      </>,
    );
    const small = screen.getByText('Small').classList;
    const compact = screen.getByText('Compact').classList;
    expect(compact).toHaveLength(small.length + 1);
    expect([...small].every(name => compact.contains(name))).toBe(true);
  });

  it("keeps a caller's class beside its own", () => {
    render(
      <>
        <MarkerBadge tone="neutral">Plain</MarkerBadge>
        <MarkerBadge tone="neutral" className="round">
          Numbered
        </MarkerBadge>
      </>,
    );
    const plain = screen.getByText('Plain').classList;
    const numbered = screen.getByText('Numbered').classList;
    expect(numbered).toContain('round');
    expect(numbered).toHaveLength(plain.length + 1);
    expect([...plain].every(name => numbered.contains(name))).toBe(true);
  });
});
