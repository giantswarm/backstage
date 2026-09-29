import { act, render, screen } from '@testing-library/react';
import { Loading } from './Loading';

describe('Loading', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('counts the seconds on the label once the wait passes ten', () => {
    render(<Loading label="Comparing with the definition…" testId="wait" />);
    act(() => jest.advanceTimersByTime(9_000));
    expect(screen.getByTestId('wait')).toHaveTextContent(
      /^Comparing with the definition…$/,
    );
    expect(
      screen.getByRole('progressbar', {
        name: 'Comparing with the definition…',
      }),
    ).toBeInTheDocument();

    act(() => jest.advanceTimersByTime(3_000));
    expect(screen.getByTestId('wait')).toHaveTextContent(
      /^Comparing with the definition… · 12 s$/,
    );
  });

  it('stops counting when the wait settles', () => {
    const { unmount } = render(<Loading label="Comparing…" testId="wait" />);
    act(() => jest.advanceTimersByTime(11_000));
    expect(screen.getByTestId('wait')).toHaveTextContent('· 11 s');
    unmount();
    expect(jest.getTimerCount()).toBe(0);
  });
});
