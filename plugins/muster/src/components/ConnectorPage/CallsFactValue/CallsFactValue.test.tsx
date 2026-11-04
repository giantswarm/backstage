import { render, screen } from '@testing-library/react';
import type { McpUsage } from '../../../apis';
import type { ConnectorUsage } from '../hooks/useConnectorUsage';
import { CallsFactValue } from './CallsFactValue';

function usageOf(overrides: Partial<McpUsage> = {}): McpUsage {
  return {
    available: true,
    range_hours: 720,
    step_hours: 24,
    buckets: [],
    totals: {
      calls: 3418,
      errors: 14,
      error_ratio: 0.004,
      p95_seconds: 0.42,
      distinct_tools: 1,
    },
    top_tools: [],
    servers: [],
    ...overrides,
  };
}

function renderValue(
  usage: ConnectorUsage,
  { authenticated = true, sessionPending = false } = {},
) {
  return render(
    <CallsFactValue
      usage={usage}
      authenticated={authenticated}
      sessionPending={sessionPending}
    />,
  );
}

const skeleton = () => screen.queryByTestId('calls-skeleton');

describe('CallsFactValue', () => {
  it('holds the line with a skeleton while the usage is read', () => {
    renderValue({ isLoading: true });

    expect(skeleton()).toBeInTheDocument();
    expect(screen.getByText('Reading calls…')).toBeInTheDocument();
  });

  it('holds the line with a skeleton until a read about to start answers', () => {
    // Enabled with the session, the read has not started on this render.
    renderValue({ isLoading: false });

    expect(skeleton()).toBeInTheDocument();
  });

  it('holds the line with a skeleton while the muster session is pending', () => {
    renderValue(
      { isLoading: false },
      { authenticated: false, sessionPending: true },
    );

    expect(skeleton()).toBeInTheDocument();
  });

  it('shows the calls and their error share once read', () => {
    renderValue({ isLoading: false, usage: usageOf() });

    expect(screen.getByText('3,418 · 0.4% errors')).toBeInTheDocument();
    expect(skeleton()).toBeNull();
  });

  it('shows no calls as 0', () => {
    renderValue({
      isLoading: false,
      usage: usageOf({
        totals: {
          calls: 0,
          errors: 0,
          error_ratio: null,
          p95_seconds: null,
          distinct_tools: 0,
        },
      }),
    });

    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('says so where the environment has no usage metrics', () => {
    renderValue({
      isLoading: false,
      usage: usageOf({ available: false, reason: 'No prometheus here.' }),
    });

    expect(
      screen.getByText('Not available for this environment'),
    ).toBeInTheDocument();
    expect(skeleton()).toBeNull();
  });

  it('says so where the read failed', () => {
    renderValue({ isLoading: false, error: new Error('muster said no') });

    expect(screen.getByText('Could not be read')).toBeInTheDocument();
    expect(skeleton()).toBeNull();
  });

  it('keeps the figure it has when a later read fails', () => {
    renderValue({
      isLoading: false,
      usage: usageOf(),
      error: new Error('muster said no'),
    });

    expect(screen.getByText('3,418 · 0.4% errors')).toBeInTheDocument();
  });

  it('says a muster session is needed without one', () => {
    renderValue({ isLoading: false }, { authenticated: false });

    expect(screen.getByText('Needs a muster session')).toBeInTheDocument();
    expect(skeleton()).toBeNull();
  });
});
