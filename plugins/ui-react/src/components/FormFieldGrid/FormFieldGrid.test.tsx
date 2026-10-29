import { render, screen } from '@testing-library/react';
import { TextField } from '@backstage/ui';
import { FormFieldGrid } from './FormFieldGrid';

// The alignment itself is layout (CSS subgrid), which jsdom does not compute;
// what is pinned here is the structure it depends on: each field is a direct
// child of the grid, so its own label, control and error can sit on the
// grid's rows.
describe('FormFieldGrid', () => {
  it('puts each field directly on the grid', () => {
    const { container } = render(
      <FormFieldGrid>
        <TextField
          label="Display name"
          description="What people see when they choose a model."
        />
        <TextField
          label="Model"
          description="The model id, as the provider names it — this one runs longer, over two lines in a narrow column."
        />
      </FormFieldGrid>,
    );

    const grid = container.firstElementChild as HTMLElement;
    expect(grid.children).toHaveLength(2);
    expect(grid.children[0]).toContainElement(
      screen.getByRole('textbox', { name: 'Display name' }),
    );
    expect(grid.children[1]).toContainElement(
      screen.getByRole('textbox', { name: 'Model' }),
    );
  });

  it('keeps one class for one column and adds the two-column one by default', () => {
    const { container, rerender } = render(
      <FormFieldGrid>
        <TextField label="Name" />
      </FormFieldGrid>,
    );
    const twoColumnClasses = (container.firstElementChild as HTMLElement)
      .classList.length;

    rerender(
      <FormFieldGrid columns={1}>
        <TextField label="Name" />
      </FormFieldGrid>,
    );
    expect((container.firstElementChild as HTMLElement).classList.length).toBe(
      twoColumnClasses - 1,
    );
  });
});
