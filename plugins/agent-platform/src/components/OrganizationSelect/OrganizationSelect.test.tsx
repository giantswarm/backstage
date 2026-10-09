import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OrganizationSelect } from './OrganizationSelect';

describe('OrganizationSelect', () => {
  it('offers all organizations and each one, and reports the choice', async () => {
    const onChange = jest.fn();
    render(
      <OrganizationSelect
        organizations={['engineering', 'support']}
        value="all"
        onChange={onChange}
      />,
    );

    const trigger = screen.getByRole('button', { name: /organization/i });
    expect(trigger).toHaveTextContent('All organizations');
    await userEvent.click(trigger);
    expect(
      screen.getAllByRole('option').map(option => option.textContent),
    ).toEqual(['All organizations', 'engineering', 'support']);
    await userEvent.click(screen.getByRole('option', { name: 'support' }));
    expect(onChange).toHaveBeenCalledWith('support');
  });

  it('renders nothing with a single organization and none chosen', () => {
    const { container } = render(
      <OrganizationSelect
        organizations={['support']}
        value="all"
        onChange={jest.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
