import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    render(<TotalsStrip totals={TOTALS} windowDays={30} />);

    expect(screen.getByText('9')).toBeInTheDocument();
    expect(screen.getByText('40')).toBeInTheDocument();
    expect(screen.getByText('7.5M')).toBeInTheDocument();
    expect(screen.getByText('120')).toBeInTheDocument();
  });

  it('holds a skeleton for the cost while the rate is in flight', () => {
    // The counts land from kagent before the two Mimir rate queries, so an em
    // dash here read as "nothing could be priced" — a finding — when the truth
    // was only "not yet".
    const { container } = render(
      <TotalsStrip totals={TOTALS} windowDays={30} isRateLoading />,
    );

    expect(screen.queryByText('—')).toBeNull();
    expect(container.querySelectorAll('.bui-Skeleton')).toHaveLength(1);
    // The counts still render; only the derived figure waits.
    expect(screen.getByText('9')).toBeInTheDocument();
  });

  it('shows the estimate once the rate lands', () => {
    const { container } = render(
      <TotalsStrip
        totals={TOTALS}
        windowDays={30}
        rates={{ blended: 3 / 1_000_000 }}
      />,
    );

    expect(container.querySelectorAll('.bui-Skeleton')).toHaveLength(0);
    expect(screen.getByText('$22.59')).toBeInTheDocument();
  });

  it('shows an em dash when the rate resolved to nothing', () => {
    // Settled, not pending: nothing in the window could be priced. That *is* a
    // finding, and it must not read as `$0.00`.
    const { container } = render(
      <TotalsStrip totals={TOTALS} windowDays={30} rates={{}} />,
    );

    expect(container.querySelectorAll('.bui-Skeleton')).toHaveLength(0);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('shows the reported cost beside the estimate, only when one was reported', () => {
    // The estimate+reported pair: the estimate is derived (tokens × rate), the
    // reported figure is what the runtimes said, in USD. Without a report the
    // stat is absent — not "$0.00".
    const { rerender } = render(
      <TotalsStrip
        totals={{ ...TOTALS, reportedCostUsd: 3.21 }}
        windowDays={30}
        rates={{ blended: 3 / 1_000_000 }}
      />,
    );

    expect(screen.getByText('Reported cost')).toBeInTheDocument();
    expect(screen.getByText('$3.21')).toBeInTheDocument();
    expect(screen.getByText('$22.59')).toBeInTheDocument();

    rerender(
      <TotalsStrip
        totals={TOTALS}
        windowDays={30}
        rates={{ blended: 3 / 1_000_000 }}
      />,
    );
    expect(screen.queryByText('Reported cost')).toBeNull();
  });

  it('shows the estimate in the installation currency, and the reported cost in USD', () => {
    // O3: estimates convert at the configured rate; the reported figure stays
    // what the runtime said.
    render(
      <TotalsStrip
        totals={{ ...TOTALS, reportedCostUsd: 3.21 }}
        windowDays={30}
        rates={{ blended: 3 / 1_000_000 }}
        currency={{ code: 'EUR', usdRate: 0.5 }}
      />,
    );

    // 7_528_800 tokens × $3/M = $22.5864 → ×0.5 = €11.29
    expect(screen.getByText('€11.29')).toBeInTheDocument();
    expect(screen.getByText('$3.21')).toBeInTheDocument();
  });

  it('has no combined token total', () => {
    // Input and output are priced differently, so their sum is not a number
    // anyone acts on — the same reason the session detail strip omits it.
    render(<TotalsStrip totals={TOTALS} windowDays={30} />);

    expect(screen.queryByText('7.5M')).toBeInTheDocument();
    expect(screen.queryByText(/Total tokens/i)).toBeNull();
  });

  it('states the window in the hints, and how the cost was estimated', async () => {
    // Keyboard focus, as in the Stat tests: the tooltip opens on it, and a
    // hover does not reach it in jsdom.
    const user = userEvent.setup();
    const tabTo = async (name: string) => {
      const button = screen.getByRole('button', { name });
      while (document.activeElement !== button) {
        await user.tab();
      }
    };
    render(
      <TotalsStrip
        totals={TOTALS}
        windowDays={30}
        rates={{ blended: 3 / 1_000_000 }}
        costBasis="Estimated: gazelle's observed cost per token over the last 7d."
      />,
    );

    await tabTo('How Sessions is calculated');
    expect(await screen.findByText(/in the last 30 days/)).toBeInTheDocument();

    await tabTo('How Est. cost is calculated');
    expect(
      await screen.findByText(/gazelle's observed cost per token/),
    ).toBeInTheDocument();
  });
});
