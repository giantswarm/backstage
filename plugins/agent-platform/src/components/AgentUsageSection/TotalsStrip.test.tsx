import { render, screen } from '@testing-library/react';
import type { SessionUsageTotals } from '@giantswarm/backstage-plugin-agent-platform-common';
import { TotalsStrip } from './TotalsStrip';

const TOTALS: SessionUsageTotals = {
  sessions: 9,
  turns: 40,
  inputTokens: 7_500_000,
  outputTokens: 28_800,
  totalTokens: 7_528_800,
  toolCalls: 120,
};

describe('TotalsStrip', () => {
  it('renders the counts kagent supplies', () => {
    render(<TotalsStrip totals={TOTALS} />);

    expect(screen.getByText('9')).toBeInTheDocument();
    expect(screen.getByText('40')).toBeInTheDocument();
    expect(screen.getByText('7.5M')).toBeInTheDocument();
    expect(screen.getByText('120')).toBeInTheDocument();
  });

  it('holds a skeleton for the cost while the rate is in flight', () => {
    // The counts land from kagent before the two Mimir rate queries, so an em
    // dash here read as "nothing could be priced" — a finding — when the truth
    // was only "not yet".
    const { container } = render(<TotalsStrip totals={TOTALS} isRateLoading />);

    expect(screen.queryByText('—')).toBeNull();
    expect(container.querySelectorAll('.bui-Skeleton')).toHaveLength(1);
    // The counts still render; only the derived figure waits.
    expect(screen.getByText('9')).toBeInTheDocument();
  });

  it('shows the estimate once the rate lands', () => {
    const { container } = render(
      <TotalsStrip totals={TOTALS} rates={{ blended: 3 / 1_000_000 }} />,
    );

    expect(container.querySelectorAll('.bui-Skeleton')).toHaveLength(0);
    expect(screen.getByText('$22.59')).toBeInTheDocument();
  });

  it('shows an em dash when the rate resolved to nothing', () => {
    // Settled, not pending: nothing in the window could be priced. That *is* a
    // finding, and it must not read as `$0.00`.
    const { container } = render(<TotalsStrip totals={TOTALS} rates={{}} />);

    expect(container.querySelectorAll('.bui-Skeleton')).toHaveLength(0);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('has no combined token total', () => {
    // Input and output are priced differently, so their sum is not a number
    // anyone acts on — the same reason the session detail strip omits it.
    render(<TotalsStrip totals={TOTALS} />);

    expect(screen.queryByText('7.5M')).toBeInTheDocument();
    expect(screen.queryByText(/Total tokens/i)).toBeNull();
  });
});
