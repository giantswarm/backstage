import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  ORGANIZATION_SELECT_CLASS_NAME,
  ORGANIZATION_SELECT_WIDTH,
  OrganizationSelect,
} from './OrganizationSelect';

// The organizations agent-manager names for the person
// (`list_organizations`).
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

  it('tells two namespaces that read the same apart by their namespace', async () => {
    const user = userEvent.setup();
    render(
      <OrganizationSelect
        // `org-acme` is a Giant Swarm organization no answer names, beside
        // the organization acme; `org-team-x` and `team-x` read the same too.
        namespaces={['org-acme', 'org-acme-x', 'org-team-x', 'team-x']}
        value={undefined}
        onChange={() => {}}
      />,
    );

    await user.click(trigger());
    expect(
      screen.getAllByRole('option').map(option => option.textContent),
    ).toEqual([
      'All organizations',
      'acmeorg-acme',
      'acme-x',
      'team-xorg-team-x',
      'team-xteam-x',
    ]);
  });

  it('keeps its width whatever is selected', () => {
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
    expect(trigger()).toHaveTextContent(name);

    rerender(
      <OrganizationSelect
        namespaces={['kagent', `org-${name}`]}
        value={undefined}
        onChange={() => {}}
      />,
    );
    expect(root).toHaveStyle({ width: `${ORGANIZATION_SELECT_WIDTH}px` });
  });

  describe('the whole name in a tooltip', () => {
    // jsdom lays nothing out: the selected value measures as cut short when
    // its text is longer than `fits` characters.
    let fits = Infinity;
    beforeAll(() => {
      Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
        configurable: true,
        get(this: HTMLElement) {
          return this.textContent?.length ?? 0;
        },
      });
      Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
        configurable: true,
        get(this: HTMLElement) {
          return Math.min(fits, this.textContent?.length ?? 0);
        },
      });
    });
    afterAll(() => {
      // jsdom keeps both on Element: dropping the overrides restores them.
      const prototype = HTMLElement.prototype as unknown as Record<
        string,
        unknown
      >;
      delete prototype.scrollWidth;
      delete prototype.clientWidth;
    });

    it('opens on keyboard focus when the box cuts the name short', async () => {
      fits = 20;
      const user = userEvent.setup();
      const name = 'a-rather-long-organization-name';
      render(
        <OrganizationSelect
          namespaces={['kagent', `org-${name}`]}
          value={`org-${name}`}
          onChange={() => {}}
        />,
      );

      await user.tab();
      expect(trigger()).toHaveFocus();
      expect(await screen.findByRole('tooltip')).toHaveTextContent(name);
    });

    it('stays shut when the whole name fits', async () => {
      fits = 20;
      const user = userEvent.setup();
      render(
        <OrganizationSelect
          namespaces={['kagent', 'org-acme']}
          value="org-acme"
          onChange={() => {}}
        />,
      );

      await user.tab();
      expect(trigger()).toHaveFocus();
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    });
  });
});
