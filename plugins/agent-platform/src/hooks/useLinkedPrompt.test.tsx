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
    </>
  );
}

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Probe />
    </MemoryRouter>,
  );
}

describe('useLinkedPrompt', () => {
  it('reads ?prompt= and takes it out of the address, keeping the rest', () => {
    renderAt('/?agent=golem%2Fkagent%2Fdefault-agent&prompt=%20Hello%20');

    expect(screen.getByTestId('prompt')).toHaveTextContent('Hello');
    expect(screen.getByTestId('search')).toHaveTextContent(
      '?agent=golem%2Fkagent%2Fdefault-agent',
    );
  });

  it('reads nothing without the parameter', () => {
    renderAt('/?agent=a');

    expect(screen.getByTestId('prompt')).toBeEmptyDOMElement();
    expect(screen.getByTestId('key')).toHaveTextContent('0');
  });

  it('takes a prompt a link brings while the page is open, with a new key', () => {
    renderAt('/?prompt=First');
    expect(screen.getByTestId('key')).toHaveTextContent('0');

    act(() => navigate('/?prompt=Second'));

    expect(screen.getByTestId('prompt')).toHaveTextContent('Second');
    expect(screen.getByTestId('key')).toHaveTextContent('1');
    expect(screen.getByTestId('search')).toBeEmptyDOMElement();
  });
});
