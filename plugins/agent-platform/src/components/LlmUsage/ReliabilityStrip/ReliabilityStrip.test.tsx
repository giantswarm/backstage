import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { LlmReliability } from '../../../lib/llmUsage';
import { ReliabilityStrip } from './ReliabilityStrip';

const RELIABILITY: LlmReliability = {
  totalRequests: 1000,
  errorRequests: 10,
  errorRatePct: 1,
  rateLimited: 0,
  p50Seconds: 1.5,
  p95Seconds: 12,
  outputTokensPerSecond: 196.8,
};

describe('ReliabilityStrip', () => {
  it('renders the speed next to the latency quantiles', () => {
    render(<ReliabilityStrip reliability={RELIABILITY} windowDays={30} />);

    expect(screen.getByText('Tokens per second')).toBeInTheDocument();
    expect(screen.getByText('200/s')).toBeInTheDocument();
    expect(screen.getByText('1.5 s')).toBeInTheDocument();
    expect(screen.getByText('12 s')).toBeInTheDocument();
  });

  it('labels the rate-limit count in words and leaves the status code to its hint', () => {
    render(<ReliabilityStrip reliability={RELIABILITY} windowDays={30} />);

    expect(screen.getByText('Rate limited')).toBeInTheDocument();
    expect(screen.queryByText(/\(429\)/)).toBeNull();
    expect(
      screen.getByLabelText('How Rate limited is calculated'),
    ).toBeInTheDocument();
  });

  it('names the selected window in its hints, not a fixed 30 days', async () => {
    const user = userEvent.setup();
    render(<ReliabilityStrip reliability={RELIABILITY} windowDays={7} />);

    // Tooltips open on keyboard focus; jsdom gives them no hover.
    const hint = screen.getByRole('button', {
      name: 'How Rate limited is calculated',
    });
    while (document.activeElement !== hint) {
      await user.tab();
    }

    expect(
      await screen.findByText(
        /^Counts requests answered 429 over the last 7 days/,
      ),
    ).toBeInTheDocument();
  });

  it('shows an em dash for the speed when nothing streamed', () => {
    // The other figures still describe every call, so the strip must not go
    // quiet just because the per-output-token histogram is empty.
    render(
      <ReliabilityStrip
        reliability={{ ...RELIABILITY, outputTokensPerSecond: undefined }}
        windowDays={30}
      />,
    );

    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText('1.5 s')).toBeInTheDocument();
  });
});
