import { act, renderHook } from '@testing-library/react';
import { usePageAttention } from './usePageAttention';

describe('usePageAttention', () => {
  let hidden = false;
  let focus = true;
  let hasFocus: jest.SpyInstance;

  beforeAll(() => {
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => hidden,
    });
  });

  afterAll(() => {
    delete (document as { hidden?: boolean }).hidden;
  });

  beforeEach(() => {
    hidden = false;
    focus = true;
    hasFocus = jest.spyOn(document, 'hasFocus').mockImplementation(() => focus);
  });

  afterEach(() => hasFocus.mockRestore());

  it('follows the tab being hidden and its window losing focus', () => {
    const { result } = renderHook(() => usePageAttention());
    expect(result.current).toEqual({ visible: true, focused: true });

    act(() => {
      focus = false;
      window.dispatchEvent(new Event('blur'));
    });
    expect(result.current).toEqual({ visible: true, focused: false });

    act(() => {
      hidden = true;
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(result.current).toEqual({ visible: false, focused: false });

    act(() => {
      hidden = false;
      focus = true;
      window.dispatchEvent(new Event('focus'));
    });
    expect(result.current).toEqual({ visible: true, focused: true });
  });
});
