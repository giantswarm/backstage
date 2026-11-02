import { render, screen } from '@testing-library/react';
import { TruncatedListNote } from './TruncatedListNote';

describe('TruncatedListNote', () => {
  it('gives the figures where the read reports a total', () => {
    render(
      <TruncatedListNote
        plural="resources"
        truncated
        shown={200}
        total={1300}
      />,
    );
    expect(
      screen.getByText(
        'This list is incomplete: muster returned 200 of 1,300 resources.',
      ),
    ).toBeInTheDocument();
  });

  it('says the list may be incomplete where there is no total', () => {
    render(<TruncatedListNote plural="tools" truncated />);
    expect(
      screen.getByText(
        'This list may be incomplete: muster returned only part of the tools.',
      ),
    ).toBeInTheDocument();
  });

  it('states figures even when muster does not flag the cut', () => {
    render(<TruncatedListNote plural="prompts" shown={2} total={3} />);
    expect(
      screen.getByText(
        'This list is incomplete: muster returned 2 of 3 prompts.',
      ),
    ).toBeInTheDocument();
  });

  it('renders nothing for a whole list', () => {
    const { container } = render(
      <TruncatedListNote plural="prompts" shown={3} total={3} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
