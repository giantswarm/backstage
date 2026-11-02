import { render, screen } from '@testing-library/react';
import { ModelChip } from './ModelChip';

describe('ModelChip', () => {
  it('names the model', () => {
    render(<ModelChip model="Sonnet 4.5" />);

    expect(screen.getByText('Sonnet 4.5')).toHaveTextContent(
      'Model: Sonnet 4.5',
    );
  });

  it('renders nothing without a model', () => {
    const { container } = render(<ModelChip />);

    expect(container).toBeEmptyDOMElement();
  });
});
