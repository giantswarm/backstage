import { renderHook } from '@testing-library/react';
import { useOnDialogOpen } from './useOnDialogOpen';

describe('useOnDialogOpen', () => {
  it('runs on every closed-to-open transition, and only then', () => {
    const onOpen = jest.fn();
    const { rerender } = renderHook(
      ({ isOpen }) => useOnDialogOpen(isOpen, onOpen),
      { initialProps: { isOpen: false } },
    );
    expect(onOpen).not.toHaveBeenCalled();

    rerender({ isOpen: true });
    expect(onOpen).toHaveBeenCalledTimes(1);

    // An open dialog re-rendering (polled data) must not reset it.
    rerender({ isOpen: true });
    expect(onOpen).toHaveBeenCalledTimes(1);

    rerender({ isOpen: false });
    expect(onOpen).toHaveBeenCalledTimes(1);

    rerender({ isOpen: true });
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it('runs when mounted open', () => {
    const onOpen = jest.fn();
    renderHook(() => useOnDialogOpen(true, onOpen));

    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('calls the latest callback', () => {
    const first = jest.fn();
    const second = jest.fn();
    const { rerender } = renderHook(
      ({ isOpen, onOpen }) => useOnDialogOpen(isOpen, onOpen),
      { initialProps: { isOpen: false, onOpen: first } },
    );

    rerender({ isOpen: true, onOpen: second });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
