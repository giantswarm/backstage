import type { ComponentType } from 'react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import { StepLayout } from './StepLayout';

jest.mock('../../hooks', () => ({
  ...jest.requireActual('../../hooks'),
  useTemplateString: (template: string) => template,
}));

describe('StepLayout', () => {
  it("links a note's footnote reference to its note", async () => {
    const props = {
      properties: [],
      formContext: { formData: {} },
      uiSchema: {
        'ui:options': { note: 'A claim[^1].\n\n[^1]: The source.' },
      },
    };
    // `LayoutTemplate` is optional; the layout itself always renders.
    const Layout = StepLayout as unknown as ComponentType<typeof props>;
    const { container } = await renderInTestApp(<Layout {...props} />);

    const reference = screen.getByRole('link', { name: '1' });
    const note = screen.getByText('The source.').closest('li');
    expect(note).toHaveAttribute('id', 'user-content-fn-1');
    expect(reference.getAttribute('href')?.split('#')[1]).toBe(note!.id);
    expect(
      container.querySelector('[id^="user-content-user-content-"]'),
    ).toBeNull();
  });
});
