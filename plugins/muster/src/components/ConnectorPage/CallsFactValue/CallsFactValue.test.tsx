import { render, screen } from '@testing-library/react';
import type { McpUsage } from '../../../apis';
import type { ConnectorUsage } from '../hooks/useConnectorUsage';
import { CallsFactValue, type CallsFactValueProps } from './CallsFactValue';

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

type Session = CallsFactValueProps['session'];

const SESSION: Session = {
  authenticated: true,
  pending: false,
  connecting: false,
};

function renderValue(usage: ConnectorUsage, session: Partial<Session> = {}) {
  return render(
    <CallsFactValue usage={usage} session={{ ...SESSION, ...session }} />,
  );
}

const skeleton = () => screen.queryByTestId('cell-skeleton');

describe('CallsFactValue', () => {
  it('holds the line with a skeleton while the usage is read', () => {
    renderValue({ isLoading: true });

    expect(skeleton()).toBeInTheDocument();
    expect(screen.getByText('Reading calls…')).toBeInTheDocument();
  });

  it('holds the line with a skeleton while the muster session is pending', () => {
    renderValue({ isLoading: false }, { authenticated: false, pending: true });

    expect(skeleton()).toBeInTheDocument();
  });

  it('holds the line with a skeleton through a reconnect', () => {
    renderValue(
      { isLoading: false },
      {
        authenticated: false,
        connecting: true,
        failure: { kind: 'session-expired', message: 'Expired.' },
      },
    );

    expect(skeleton()).toBeInTheDocument();
  });

  it('ends an idle read with a reason, not an endless skeleton', () => {
    renderValue({ isLoading: false });

    expect(screen.getByText('Not available')).toBeInTheDocument();
    expect(skeleton()).toBeNull();
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

    expect(screen.getByText('Needs a Muster session')).toBeInTheDocument();
    expect(skeleton()).toBeNull();
  });

  it.each([
    ['unreachable', 'Muster is not reachable from this portal'],
    ['session-expired', 'Your sign-in has expired'],
    ['mint-failed', 'No Muster session could be started'],
    ['muster-rejected', 'Muster refused the session'],
  ] as const)(
    'says why there is no session after a %s failure',
    (kind, text) => {
      renderValue(
        { isLoading: false },
        { authenticated: false, failure: { kind, message: 'Why.' } },
      );

      expect(screen.getByText(text)).toBeInTheDocument();
      expect(skeleton()).toBeNull();
    },
  );
});
