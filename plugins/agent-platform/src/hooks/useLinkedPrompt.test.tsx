import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';

import { useLinkedPrompt } from './useLinkedPrompt';

let navigate: ReturnType<typeof useNavigate> = () => {};

function Probe() {
  const { prompt, key } = useLinkedPrompt();
  const location = useLocation();
  navigate = useNavigate();
  return (
    <>
      <div data-testid="prompt">{prompt ?? ''}</div>
      <div data-testid="key">{key}</div>
      <div data-testid="search">{location.search}</div>
      <div data-testid="hash">{location.hash}</div>
      <div data-testid="state">{JSON.stringify(location.state)}</div>
    </>
  );
}

function renderAt(
  url:
    string | { pathname: string; search: string; hash: string; state: unknown },
) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Probe />
    </MemoryRouter>,
  );
}

describe('useLinkedPrompt', () => {
  it('reads #prompt= and takes it out of the address, keeping the rest', () => {
    renderAt('/?agent=golem%2Fkagent%2Fdefault-agent#prompt=%20Hello%20');

    expect(screen.getByTestId('prompt')).toHaveTextContent('Hello');
    expect(screen.getByTestId('search')).toHaveTextContent(
      '?agent=golem%2Fkagent%2Fdefault-agent',
    );
    expect(screen.getByTestId('hash')).toBeEmptyDOMElement();
  });

  it('reads nothing without the parameter, nor from the query', () => {
    renderAt('/?agent=a&prompt=Old');

    expect(screen.getByTestId('prompt')).toBeEmptyDOMElement();
    expect(screen.getByTestId('key')).toHaveTextContent('0');
  });

  it('takes a prompt a link brings while the page is open, with a new key', () => {
    renderAt('/#prompt=First');
    expect(screen.getByTestId('key')).toHaveTextContent('0');

    act(() => navigate('/#prompt=Second'));

    expect(screen.getByTestId('prompt')).toHaveTextContent('Second');
    expect(screen.getByTestId('key')).toHaveTextContent('1');
    expect(screen.getByTestId('hash')).toBeEmptyDOMElement();
  });

  it('keeps the query, the rest of the fragment and the router state', () => {
    renderAt({
      pathname: '/',
      search: '?agent=a',
      hash: '#composer&prompt=Hi',
      state: { from: 'agents' },
    });

    expect(screen.getByTestId('prompt')).toHaveTextContent('Hi');
    expect(screen.getByTestId('search')).toHaveTextContent('?agent=a');
    expect(screen.getByTestId('hash')).toHaveTextContent('#composer');
    expect(screen.getByTestId('state')).toHaveTextContent('{"from":"agents"}');
  });

  it('does not start over for a blank prompt a link brings', () => {
    renderAt('/#prompt=First');

    act(() => navigate('/#prompt=%20'));

    expect(screen.getByTestId('prompt')).toHaveTextContent('First');
    expect(screen.getByTestId('key')).toHaveTextContent('0');
  });
});
