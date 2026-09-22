import { render, screen } from '@testing-library/react';
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
    render(<ReliabilityStrip reliability={RELIABILITY} />);

    expect(screen.getByText('Tokens per second')).toBeInTheDocument();
    expect(screen.getByText('197/s')).toBeInTheDocument();
    expect(screen.getByText('1.5s')).toBeInTheDocument();
    expect(screen.getByText('12s')).toBeInTheDocument();
  });

  it('shows an em dash for the speed when nothing streamed', () => {
    // The other figures still describe every call, so the strip must not go
    // quiet just because the per-output-token histogram is empty.
    render(
      <ReliabilityStrip
        reliability={{ ...RELIABILITY, outputTokensPerSecond: undefined }}
      />,
    );

    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText('1.5s')).toBeInTheDocument();
  });
});
