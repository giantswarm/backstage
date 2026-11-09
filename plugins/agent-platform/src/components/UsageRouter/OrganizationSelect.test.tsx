import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  ORGANIZATION_SELECT_CLASS_NAME,
  ORGANIZATION_SELECT_WIDTH,
  OrganizationSelect,
} from './OrganizationSelect';

// The organizations agent-manager names for the person
// (`list_my_organizations`).
jest.mock('../OrganizationDirectoryProvider', () => ({
  ...jest.requireActual('../OrganizationDirectoryProvider'),
  useOrganizationDirectory: () =>
    jest.requireActual('../../lib/__fixtures__/organizations')
      .TEST_ORGANIZATION_DIRECTORY,
}));

function trigger() {
  return screen.getByRole('button', { name: /Organization/ });
}

describe('OrganizationSelect', () => {
  it('offers every organization first, then each namespace named as an organization', async () => {
    const user = userEvent.setup();
    render(
      <OrganizationSelect
        namespaces={['kagent', 'org-acme', 'org-marian', 'team-x']}
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
      // A Giant Swarm organization's namespace no answer names reads as the
      // organization, without its `org-` prefix.
      'marian',
      // Any other namespace reads as it is, with no `namespace` qualifier.
      'team-x',
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

  it('names a Giant Swarm organization without its prefix, and answers with its namespace', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    const namespaces = ['kagent', 'org-agent-platform-test-b'];
    const { rerender } = render(
      <OrganizationSelect
        namespaces={namespaces}
        value={undefined}
        onChange={onChange}
      />,
    );

    await user.click(trigger());
    await user.click(
      screen.getByRole('option', { name: 'agent-platform-test-b' }),
    );
    expect(onChange).toHaveBeenLastCalledWith('org-agent-platform-test-b');

    rerender(
      <OrganizationSelect
        namespaces={namespaces}
        value="org-agent-platform-test-b"
        onChange={onChange}
      />,
    );
    expect(trigger()).toHaveTextContent('agent-platform-test-b');
    expect(trigger()).not.toHaveTextContent('org-agent-platform-test-b');
  });

  it('keeps its width whatever is selected, and names a long selection in full on hover', () => {
    const name = 'a-rather-long-organization-name-that-would-widen-the-header';
    const { container, rerender } = render(
      <OrganizationSelect
        namespaces={['kagent', `org-${name}`]}
        value={`org-${name}`}
        onChange={() => {}}
      />,
    );
    const root = container.querySelector(`.${ORGANIZATION_SELECT_CLASS_NAME}`);

    // A fixed box: bui's SelectValue cuts the name short with an ellipsis
    // inside it instead of the box growing with the name.
    expect(root).toHaveStyle({ width: `${ORGANIZATION_SELECT_WIDTH}px` });
    expect(root).toHaveAttribute('title', name);
    expect(trigger()).toHaveTextContent(name);

    rerender(
      <OrganizationSelect
        namespaces={['kagent', `org-${name}`]}
        value={undefined}
        onChange={() => {}}
      />,
    );
    expect(root).toHaveStyle({ width: `${ORGANIZATION_SELECT_WIDTH}px` });
    expect(root).toHaveAttribute('title', 'All organizations');
  });
});
