import { useEffect } from 'react';
import { act, render, screen } from '@testing-library/react';
import { BrowserRouter, useLocation, useNavigate } from 'react-router-dom';

import { useLinkedPrompt } from './useLinkedPrompt';

let navigate: ReturnType<typeof useNavigate> = () => {};
let pageViews: string[] = [];

function Probe() {
  const { prompt, key } = useLinkedPrompt();
  const { pathname, search, hash } = useLocation();
  navigate = useNavigate();
  // What Backstage's RouteTracker records: one `navigate` per change.
  useEffect(() => {
    pageViews.push(`${pathname}${search}${hash}`);
  }, [pathname, search, hash]);
  return (
    <>
      <div data-testid="prompt">{prompt ?? ''}</div>
      <div data-testid="key">{key}</div>
    </>
  );
}

function renderAt(url: string, state: unknown = null) {
  window.history.replaceState(state, '', url);
  return render(
    <BrowserRouter>
      <Probe />
    </BrowserRouter>,
  );
}

const address = () =>
  `${window.location.pathname}${window.location.search}${window.location.hash}`;

describe('useLinkedPrompt', () => {
  beforeEach(() => {
    pageViews = [];
  });

  it('reads #prompt= and takes it out of the address, keeping the rest', () => {
    renderAt('/?agent=golem%2Fkagent%2Fdefault-agent#prompt=%20Hello%20');

    expect(screen.getByTestId('prompt')).toHaveTextContent('Hello');
    expect(address()).toBe('/?agent=golem%2Fkagent%2Fdefault-agent');
  });

  it('records one page view for a link with a prompt', () => {
    renderAt('/?agent=a#prompt=Hello');

    expect(address()).toBe('/?agent=a');
    expect(pageViews).toEqual(['/?agent=a#prompt=Hello']);
  });

  it('reads nothing without the parameter, nor from the query', () => {
    renderAt('/?agent=a&prompt=Old');

    expect(screen.getByTestId('prompt')).toBeEmptyDOMElement();
    expect(screen.getByTestId('key')).toHaveTextContent('0');
    expect(address()).toBe('/?agent=a&prompt=Old');
  });

  it('takes a prompt a link brings while the page is open, with a new key', () => {
    renderAt('/#prompt=First');
    expect(screen.getByTestId('key')).toHaveTextContent('0');

    act(() => navigate('/#prompt=Second'));

    expect(screen.getByTestId('prompt')).toHaveTextContent('Second');
    expect(screen.getByTestId('key')).toHaveTextContent('1');
    expect(address()).toBe('/');

    act(() => navigate('/#prompt=Second'));

    expect(screen.getByTestId('key')).toHaveTextContent('2');
    expect(address()).toBe('/');
  });

  it('keeps the query, the rest of the fragment and the router state', () => {
    renderAt('/?agent=a#composer&prompt=Hi', {
      usr: { from: 'agents' },
      key: 'k1',
      idx: 0,
    });

    expect(screen.getByTestId('prompt')).toHaveTextContent('Hi');
    expect(address()).toBe('/?agent=a#composer');
    expect(window.history.state).toEqual({
      usr: { from: 'agents' },
      key: 'k1',
      idx: 0,
    });
  });

  it('does not start over for a blank prompt a link brings', () => {
    renderAt('/#prompt=First');

    act(() => navigate('/#prompt=%20'));

    expect(screen.getByTestId('prompt')).toHaveTextContent('First');
    expect(screen.getByTestId('key')).toHaveTextContent('0');
    expect(address()).toBe('/');
  });
});
