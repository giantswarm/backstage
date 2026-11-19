import { render, screen } from '@testing-library/react';
import { ToolsetHint } from './ToolsetHint';

describe('ToolsetHint', () => {
  it('sets a quiet note as a secondary 12px caption, with no icon', () => {
    const { container } = render(<ToolsetHint>Nothing selected.</ToolsetHint>);

    const note = screen.getByText('Nothing selected.');
    expect(note).toHaveAttribute('data-variant', 'body-small');
    expect(note).toHaveAttribute('data-color', 'secondary');
    expect(container.querySelector('svg')).toBeNull();
  });

  it('marks a problem with an error icon as well as its colour, at the same size', () => {
    const { container } = render(
      <ToolsetHint problem>The connector is not reachable.</ToolsetHint>,
    );

    const problem = screen.getByText('The connector is not reachable.');
    expect(problem).toHaveAttribute('data-variant', 'body-small');
    expect(problem).toHaveAttribute('data-color', 'danger');
    const icon = container.querySelector('svg');
    expect(icon).not.toBeNull();
    expect(icon!.closest('[aria-hidden]')).not.toBeNull();
  });
});
