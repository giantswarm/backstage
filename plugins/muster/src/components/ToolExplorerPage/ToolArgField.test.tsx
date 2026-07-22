import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SchemaField } from '../../lib/schemaForm';
import { ToolArgField } from './ToolArgField';

function renderField(field: SchemaField, overrides = {}) {
  const onChange = jest.fn();
  const onToggleJson = jest.fn();
  render(
    <ToolArgField
      field={field}
      value={undefined}
      jsonMode={false}
      onChange={onChange}
      onToggleJson={onToggleJson}
      {...overrides}
    />,
  );
  return { onChange, onToggleJson };
}

describe('ToolArgField', () => {
  it('renders a boolean field as a switch and reports changes', async () => {
    const { onChange } = renderField({
      name: 'verbose',
      type: 'boolean',
      required: false,
    });

    const toggle = screen.getByRole('switch');
    await userEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('renders an enum field as a select', () => {
    renderField({
      name: 'level',
      type: 'string',
      required: true,
      enumValues: ['low', 'high'],
    });

    // The bui Select renders a labelled trigger button.
    expect(screen.getByText('level (string)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /level/i })).toBeInTheDocument();
  });

  it('renders a number field', () => {
    renderField({ name: 'count', type: 'integer', required: false });

    expect(screen.getByText('count (integer)')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /count/i })).toBeInTheDocument();
  });

  it('renders a text field and reports typed input', async () => {
    const { onChange } = renderField({
      name: 'name',
      type: 'string',
      required: true,
    });

    const input = screen.getByRole('textbox', { name: /name/i });
    await userEvent.type(input, 'a');
    expect(onChange).toHaveBeenCalledWith('a');
  });

  it('renders array rows with add and JSON-mode toggle affordances', async () => {
    const { onChange, onToggleJson } = renderField(
      {
        name: 'tags',
        type: 'array',
        required: false,
        itemType: 'string',
      },
      { value: ['one'] },
    );

    await userEvent.click(screen.getByRole('button', { name: 'Add item' }));
    expect(onChange).toHaveBeenCalledWith(['one', '']);

    await userEvent.click(screen.getByRole('button', { name: 'Edit as JSON' }));
    expect(onToggleJson).toHaveBeenCalled();
  });
});
