import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OrganizationSelect } from './OrganizationSelect';

function trigger() {
  return screen.getByRole('button', { name: /Organization/ });
}

describe('OrganizationSelect', () => {
  it('offers every organization first, then the namespaces as the Agents list names them', async () => {
    const user = userEvent.setup();
    render(
      <OrganizationSelect
        namespaces={['kagent', 'org-acme', 'team-x']}
        value={undefined}
        onChange={() => {}}
      />,
    );

    expect(trigger()).toHaveTextContent('All organizations');
    await user.click(trigger());

    expect(
      screen.getAllByRole('option').map(option => option.textContent),
    ).toEqual([
      'All organizations',
      // The platform says what it is, since "None" alone says little here.
      'NonePlatform: agents available to every organization',
      // An organization's name is not its namespace, so the namespace goes
      // under it.
      'acmeorg-acme',
      'namespace team-x',
    ]);
  });

  it('answers a choice with the namespace, and every organization with nothing', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    const { rerender } = render(
      <OrganizationSelect
        namespaces={['kagent', 'org-acme']}
        value={undefined}
        onChange={onChange}
      />,
    );

    await user.click(trigger());
    await user.click(screen.getByRole('option', { name: 'acme' }));
    expect(onChange).toHaveBeenLastCalledWith('org-acme');

    // The control is the URL's: the parent answers the choice with the value.
    rerender(
      <OrganizationSelect
        namespaces={['kagent', 'org-acme']}
        value="org-acme"
        onChange={onChange}
      />,
    );
    expect(trigger()).toHaveTextContent('acme');

    await user.click(trigger());
    await user.click(screen.getByRole('option', { name: 'All organizations' }));
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it('shows the selection, also one the options do not hold', async () => {
    const user = userEvent.setup();
    render(
      <OrganizationSelect
        namespaces={['kagent']}
        value="org-deep-link"
        onChange={() => {}}
      />,
    );

    expect(trigger()).toHaveTextContent('deep-link');
    await user.click(trigger());
    expect(
      screen.getByRole('option', { name: 'deep-link' }),
    ).toBeInTheDocument();
  });
});
