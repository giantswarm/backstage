import { render, screen } from '@testing-library/react';
import { MetricsUnavailableAlert } from './MetricsUnavailableAlert';
import {
  describeMimirFailure,
  OLDER_METRICS_UNAVAILABLE,
  pickMimirError,
} from './describeMimirFailure';

const olderDataError = Object.assign(new Error('Mimir could not answer'), {
  reason: 'older_data_unavailable',
});

describe('describeMimirFailure', () => {
  it('has words for a Mimir that cannot read older data', () => {
    expect(describeMimirFailure(olderDataError)).toBe(
      OLDER_METRICS_UNAVAILABLE,
    );
  });

  it.each([
    ['an error without a reason', new Error('boom')],
    ['an unknown reason', Object.assign(new Error('x'), { reason: 'other' })],
    ['no error', null],
    ['a string', 'boom'],
  ])('has none for %s', (_, error) => {
    expect(describeMimirFailure(error)).toBeUndefined();
  });
});

describe('MetricsUnavailableAlert', () => {
  it("shows the caller's words for a failure without a reason", () => {
    render(
      <MetricsUnavailableAlert
        error={new Error('boom')}
        description="Try again later."
      />,
    );

    expect(screen.getByText('Metrics unavailable')).toBeInTheDocument();
    expect(screen.getByText('Try again later.')).toBeInTheDocument();
  });

  it('says that older data is temporarily unavailable, whatever the caller passed', () => {
    render(
      <MetricsUnavailableAlert
        error={olderDataError}
        title="Gateway API metrics could not be loaded."
      />,
    );

    expect(
      screen.getByText('Older data is temporarily unavailable'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/cannot read data older than a few hours/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Gateway API metrics could not be loaded.'),
    ).not.toBeInTheDocument();
  });

  it('renders the fallback instead for a failure without a reason', () => {
    render(
      <MetricsUnavailableAlert
        error={new Error('boom')}
        fallback={<p>Could not be read right now.</p>}
      />,
    );

    expect(
      screen.getByText('Could not be read right now.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Metrics unavailable')).not.toBeInTheDocument();
  });

  it('ignores the fallback when Mimir said why', () => {
    render(
      <MetricsUnavailableAlert
        error={olderDataError}
        fallback={<p>Could not be read right now.</p>}
      />,
    );

    expect(
      screen.getByText('Older data is temporarily unavailable'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Could not be read right now.'),
    ).not.toBeInTheDocument();
  });
});

describe('pickMimirError', () => {
  it('prefers an error Mimir said the reason for, wherever it is', () => {
    const timeout = new Error('timed out');
    expect(pickMimirError(null, timeout, undefined, olderDataError)).toBe(
      olderDataError,
    );
  });

  it('takes the first failure otherwise, and null without one', () => {
    const first = new Error('first');
    expect(pickMimirError(null, first, new Error('second'))).toBe(first);
    expect(pickMimirError(null, undefined)).toBeNull();
  });

  it('reads the shared words as one sentence', () => {
    expect(OLDER_METRICS_UNAVAILABLE.sentence).toBe(
      `${OLDER_METRICS_UNAVAILABLE.title}. ${OLDER_METRICS_UNAVAILABLE.description}`,
    );
  });
});
