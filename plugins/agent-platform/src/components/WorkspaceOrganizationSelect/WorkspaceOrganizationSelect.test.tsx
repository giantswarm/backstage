import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WorkspaceOrganizationSelect } from './WorkspaceOrganizationSelect';

let organizations: string[] = [];
let organization: string | undefined;

jest.mock('../WorkspacesDataProvider', () => ({
  useWorkspacesData: () => ({
    organizations,
    organization,
    setOrganization: jest.fn(),
  }),
}));

function trigger() {
  return screen.getByRole('button', { name: /Organization/ });
}

describe('WorkspaceOrganizationSelect', () => {
  it('is not there for a person in one Organization', () => {
    organizations = ['meadow-team'];
    organization = 'meadow-team';
    const { container } = render(<WorkspaceOrganizationSelect />);
    expect(container).toBeEmptyDOMElement();
  });

  // A narrow header cuts a long name short with an ellipsis.
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
      const name = 'a-rather-long-organization-name';
      organizations = ['meadow-team', name];
      organization = name;
      const user = userEvent.setup();
      render(<WorkspaceOrganizationSelect />);

      await user.tab();
      expect(trigger()).toHaveFocus();
      expect(await screen.findByRole('tooltip')).toHaveTextContent(name);
    });

    it('stays shut when the whole name fits', async () => {
      fits = 20;
      organizations = ['meadow-team', 'fennel-team'];
      organization = 'fennel-team';
      const user = userEvent.setup();
      render(<WorkspaceOrganizationSelect />);

      await user.tab();
      expect(trigger()).toHaveFocus();
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    });
  });
});
