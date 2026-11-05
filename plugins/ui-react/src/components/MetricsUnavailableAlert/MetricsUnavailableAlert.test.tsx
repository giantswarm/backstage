import { render, screen } from '@testing-library/react';
import { MetricsUnavailableAlert } from './MetricsUnavailableAlert';
import {
  describeMimirFailure,
  OLDER_METRICS_UNAVAILABLE,
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
});
