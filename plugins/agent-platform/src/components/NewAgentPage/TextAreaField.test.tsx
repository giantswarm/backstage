import { render, screen } from '@testing-library/react';
import { TextAreaField } from './TextAreaField';

describe('TextAreaField', () => {
  it('counts characters against the limit and links the count to the field', () => {
    render(
      <TextAreaField
        label="System prompt"
        value={'🙂'.repeat(3)}
        onChange={() => {}}
        maxLength={20000}
      />,
    );
    const field = screen.getByLabelText('System prompt');
    const counter = screen.getByText('3 / 20,000 characters');
    expect(field).toHaveAttribute('aria-describedby', counter.id);
    expect(field).not.toHaveAttribute('aria-invalid');
  });

  it('marks the field invalid and says why', () => {
    render(
      <TextAreaField
        label="System prompt"
        value="too long"
        onChange={() => {}}
        maxLength={5}
        error="System prompt is 8 characters; the limit is 5. Move long reference material into a skill"
      />,
    );
    const field = screen.getByLabelText('System prompt');
    const error = screen.getByRole('alert');
    expect(error).toHaveTextContent(
      'Move long reference material into a skill',
    );
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field.getAttribute('aria-describedby')?.split(' ')).toContain(
      error.id,
    );
  });
});
