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
  let scrollTo: jest.SpyInstance;

  beforeEach(() => {
    scrollTo = jest
      .spyOn(window, 'scrollTo')
      .mockImplementation(() => undefined);
    render(
      <MemoryRouter initialEntries={['/workflows']}>
        <Probe />
      </MemoryRouter>,
    );
    scrollTo.mockClear();
  });

  afterEach(() => scrollTo.mockRestore());

  it('scrolls to the top on a new pathname, not on a new query string', () => {
    act(() => navigate('/workflows/agent-roster'));
    expect(scrollTo).toHaveBeenCalledWith(0, 0);

    scrollTo.mockClear();
    act(() => navigate('/workflows/agent-roster?installation=gazelle'));
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('leaves Back to the browser', () => {
    act(() => navigate('/workflows/agent-roster'));
    scrollTo.mockClear();

    act(() => navigate(-1));
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
