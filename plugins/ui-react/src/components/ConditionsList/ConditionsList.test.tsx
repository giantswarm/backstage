import { render, screen } from '@testing-library/react';
import { ConditionsList, ConditionLike } from './ConditionsList';

const accepted: ConditionLike = {
  type: 'Accepted',
  status: 'True',
  reason: 'Reconciled',
  message: 'Agent configuration accepted',
  lastTransitionTime: '2026-07-31T10:00:00Z',
};

const notReady: ConditionLike = {
  type: 'Ready',
  status: 'False',
  reason: 'DeploymentNotReady',
  message: 'Deployment is not ready, 0/1 pods are ready',
  lastTransitionTime: '2026-07-31T10:05:00Z',
};

/** The visible trigger buttons, in render order. */
function triggers() {
  return screen.getAllByRole('button');
}

describe('ConditionsList', () => {
  it('renders one entry per condition, labelled by type', () => {
    render(<ConditionsList conditions={[accepted, notReady]} />);

    expect(screen.getByText('Accepted')).toBeInTheDocument();
    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(triggers()).toHaveLength(2);
  });

  it('sorts the most recent transition first', () => {
    render(<ConditionsList conditions={[accepted, notReady]} />);

    expect(triggers()[0]).toHaveTextContent('Ready');
    expect(triggers()[1]).toHaveTextContent('Accepted');
  });

  // Conditions with no timestamp sort last in either direction: "unknown" is not
  // "oldest".
  it('sorts conditions without a timestamp last', () => {
    render(
      <ConditionsList
        conditions={[{ type: 'Orphan', status: 'True' }, accepted]}
      />,
    );

    expect(triggers()[0]).toHaveTextContent('Accepted');
    expect(triggers()[1]).toHaveTextContent('Orphan');
  });

  it('expands the first failing condition and leaves the rest collapsed', () => {
    render(<ConditionsList conditions={[accepted, notReady]} />);

    const [readyTrigger, acceptedTrigger] = triggers();
    expect(readyTrigger).toHaveAttribute('aria-expanded', 'true');
    expect(acceptedTrigger).toHaveAttribute('aria-expanded', 'false');

    // The message the reader came for is visible without a click.
    expect(
      screen.getByText('Deployment is not ready, 0/1 pods are ready'),
    ).toBeInTheDocument();
  });

  it('expands nothing when every condition is satisfied', () => {
    render(<ConditionsList conditions={[accepted]} />);

    expect(triggers()[0]).toHaveAttribute('aria-expanded', 'false');
  });

  it('shows the status and reason of the expanded condition', () => {
    render(<ConditionsList conditions={[notReady]} />);

    expect(screen.getByText('False')).toBeInTheDocument();
    expect(screen.getByText('DeploymentNotReady')).toBeInTheDocument();
  });

  // A resource whose bad news is `status: True` (Stalled, UnsupportedFeatures)
  // must be able to invert the test.
  it('honours a custom isFailing for abnormal-true conditions', () => {
    const unsupported: ConditionLike = {
      type: 'UnsupportedFeatures',
      status: 'True',
      reason: 'UnsupportedFeatures',
      message: 'memory is not supported by the go runtime',
      lastTransitionTime: '2026-07-31T10:06:00Z',
    };

    render(
      <ConditionsList
        conditions={[accepted, unsupported]}
        isFailing={condition =>
          condition.type === 'UnsupportedFeatures'
            ? condition.status === 'True'
            : condition.status !== 'True'
        }
      />,
    );

    expect(triggers()[0]).toHaveTextContent('UnsupportedFeatures');
    expect(triggers()[0]).toHaveAttribute('aria-expanded', 'true');
    expect(
      screen.getByText('memory is not supported by the go runtime'),
    ).toBeInTheDocument();
  });

  it('renders per-condition actions when asked', () => {
    render(
      <ConditionsList
        conditions={[notReady]}
        renderActions={condition => <span>explain {condition.type}</span>}
      />,
    );

    expect(screen.getByText('explain Ready')).toBeInTheDocument();
  });

  it('renders the empty content instead of a list when there are no conditions', () => {
    render(
      <ConditionsList conditions={[]} emptyContent="No status reported yet." />,
    );

    expect(screen.getByText('No status reported yet.')).toBeInTheDocument();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('renders nothing at all when empty with no empty content', () => {
    const { container } = render(<ConditionsList conditions={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});
