import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  mockDesktopLayout,
  mockPhoneLayout,
  type MockedLayout,
} from '@giantswarm/backstage-plugin-ui-react';

import { ModelHostingActions, type HostingAction } from './ModelHostingActions';

function action(id: string, label: string, extra: Partial<HostingAction> = {}) {
  return { id, label, onAction: jest.fn(), ...extra };
}

function setup() {
  const serve = action('serve', 'Serve model');
  const importModel = action('import', 'Import from Hugging Face');
  const pull = action('pull', 'Pull model');
  const addBackend = action('add-backend', 'Add model backend');
  const addPool = action('add-pool', 'Add GPU node pool', {
    isDisabled: true,
  });
  render(
    <ModelHostingActions
      primary={serve}
      secondary={importModel}
      more={[pull, addBackend, addPool]}
    />,
  );
  return { serve, importModel, pull, addBackend, addPool };
}

async function openMenu() {
  await userEvent.click(
    screen.getByRole('button', { name: 'Model hosting actions' }),
  );
  return screen.findByRole('menu');
}

describe('ModelHostingActions', () => {
  let layout: MockedLayout | undefined;
  afterEach(() => {
    layout?.restore();
    layout = undefined;
  });

  describe('on a wide screen', () => {
    beforeEach(() => {
      layout = mockDesktopLayout();
    });

    it('shows the secondary and the primary as buttons, primary last, the rest in the menu', async () => {
      const { serve, addBackend } = setup();

      const buttons = screen.getAllByRole('button');
      expect(buttons.map(button => button.textContent)).toEqual([
        'Import from Hugging Face',
        'Serve model',
        '',
      ]);
      expect(buttons[2]).toHaveAccessibleName('Model hosting actions');

      await userEvent.click(
        screen.getByRole('button', { name: 'Serve model' }),
      );
      expect(serve.onAction).toHaveBeenCalledTimes(1);

      const menu = await openMenu();
      expect(
        within(menu)
          .getAllByRole('menuitem')
          .map(item => item.textContent),
      ).toEqual(['Pull model', 'Add model backend', 'Add GPU node pool']);
      expect(
        within(menu).getByRole('menuitem', { name: 'Add GPU node pool' }),
      ).toHaveAttribute('aria-disabled', 'true');

      await userEvent.click(
        within(menu).getByRole('menuitem', { name: 'Add model backend' }),
      );
      expect(addBackend.onAction).toHaveBeenCalledTimes(1);
    });

    it('leaves the menu out when nothing goes in it', () => {
      render(
        <ModelHostingActions primary={action('add', 'Add GPU node pool')} />,
      );
      expect(
        screen.queryByRole('button', { name: 'Model hosting actions' }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Add GPU node pool' }),
      ).toBeInTheDocument();
    });

    it('renders nothing without an action', () => {
      const { container } = render(<ModelHostingActions />);
      expect(container).toBeEmptyDOMElement();
    });
  });

  describe('at phone width', () => {
    beforeEach(() => {
      layout = mockPhoneLayout();
    });

    it('keeps one button, the primary, and moves the secondary into the menu', async () => {
      const { importModel } = setup();

      expect(
        screen.getByRole('button', { name: 'Serve model' }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Import from Hugging Face' }),
      ).not.toBeInTheDocument();

      const menu = await openMenu();
      expect(
        within(menu)
          .getAllByRole('menuitem')
          .map(item => item.textContent),
      ).toEqual([
        'Import from Hugging Face',
        'Pull model',
        'Add model backend',
        'Add GPU node pool',
      ]);
      await userEvent.click(
        within(menu).getByRole('menuitem', {
          name: 'Import from Hugging Face',
        }),
      );
      expect(importModel.onAction).toHaveBeenCalledTimes(1);
    });

    it('keeps the secondary as the one button where there is no primary', () => {
      render(
        <ModelHostingActions
          secondary={action('pull', 'Pull model')}
          more={[action('add-backend', 'Add model backend')]}
        />,
      );
      expect(
        screen.getByRole('button', { name: 'Pull model' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Model hosting actions' }),
      ).toBeInTheDocument();
    });
  });
});
