import { MemoryRouter, useNavigate } from 'react-router-dom';
import { act, render } from '@testing-library/react';
import { useScrollToTopOnNavigation } from './useScrollToTopOnNavigation';

let navigate: ReturnType<typeof useNavigate>;

const Probe = () => {
  useScrollToTopOnNavigation();
  navigate = useNavigate();
  return null;
};

describe('useScrollToTopOnNavigation', () => {
  it('scrolls to the top on a new pathname, not on a new query string', () => {
    const scrollTo = jest
      .spyOn(window, 'scrollTo')
      .mockImplementation(() => undefined);
    render(
      <MemoryRouter initialEntries={['/workflows']}>
        <Probe />
      </MemoryRouter>,
    );
    scrollTo.mockClear();

    act(() => navigate('/workflows/agent-roster'));
    expect(scrollTo).toHaveBeenCalledWith(0, 0);

    scrollTo.mockClear();
    act(() => navigate('/workflows/agent-roster?installation=gazelle'));
    expect(scrollTo).not.toHaveBeenCalled();

    scrollTo.mockRestore();
  });
});
