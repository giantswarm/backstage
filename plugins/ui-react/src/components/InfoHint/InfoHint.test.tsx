import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  mockDesktopLayout,
  MockedLayout,
  mockPhoneLayout,
} from '../../testUtils/mockPhoneLayout';
import type { ReactElement } from 'react';
import { ShellScopeProvider } from '../ShellScope';
import { InfoHint } from './InfoHint';

/** Renders as the agent-platform shell does: inside its scope. */
function renderInShell(ui: ReactElement) {
  return render(ui, { wrapper: ShellScopeProvider });
}

describe('InfoHint', () => {
  let layout: MockedLayout | undefined;
  afterEach(() => {
    layout?.restore();
    layout = undefined;
  });

  it('is a button named by what it reveals, and shows its text on focus', async () => {
    const user = userEvent.setup();
    render(
      <InfoHint label="Why this agent is not accepted">It broke.</InfoHint>,
    );

    const button = screen.getByRole('button', {
      name: 'Why this agent is not accepted',
    });
    await user.tab();
    expect(button).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('It broke.');
  });

  it('keeps the tooltip alone on classic pages: a press opens nothing', async () => {
    layout = mockPhoneLayout();
    const user = userEvent.setup();
    render(<InfoHint label="How capacity is counted">Ready nodes.</InfoHint>);

    const button = screen.getByRole('button', {
      name: 'How capacity is counted',
    });
    expect(button).not.toHaveAttribute('aria-expanded');
    await user.click(button);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens a popover named by its label on a press, and Escape gives focus back', async () => {
    layout = mockDesktopLayout();
    const user = userEvent.setup();
    renderInShell(
      <InfoHint label="How Tokens per second is calculated">
        Completion tokens over generation time.
      </InfoHint>,
    );

    const button = screen.getByRole('button', {
      name: 'How Tokens per second is calculated',
    });
    expect(button).toHaveAttribute('aria-expanded', 'false');

    await user.click(button);
    const dialog = await screen.findByRole('dialog', {
      name: 'How Tokens per second is calculated',
    });
    expect(dialog).toHaveTextContent('Completion tokens over generation time.');
    expect(button).toHaveAttribute('aria-expanded', 'true');
    await waitFor(() => expect(dialog).toHaveFocus());

    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    // FocusScope restores focus a frame after the popover unmounts.
    await waitFor(() => expect(button).toHaveFocus());
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes on a press outside it', async () => {
    layout = mockDesktopLayout();
    const user = userEvent.setup();
    renderInShell(
      <>
        <InfoHint label="Why not ready">Compiling revision rev-2.</InfoHint>
        <p>Elsewhere</p>
      </>,
    );

    await user.click(screen.getByRole('button', { name: 'Why not ready' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    await user.click(document.body);
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
  });

  it('opens on a tap on a phone, where there is no tooltip to hover', async () => {
    layout = mockPhoneLayout();
    const user = userEvent.setup();
    renderInShell(
      <InfoHint label="How healthy is counted">Two are off.</InfoHint>,
    );

    const button = screen.getByRole('button', {
      name: 'How healthy is counted',
    });
    // Focus alone shows nothing on touch input: a tap is the way in.
    act(() => button.focus());
    await act(() => new Promise(resolve => setTimeout(resolve, 300)));
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    await user.click(button);
    expect(
      await screen.findByRole('dialog', { name: 'How healthy is counted' }),
    ).toHaveTextContent('Two are off.');
  });

  it('keeps a press on the hint or in its popover from reaching a clickable row', async () => {
    layout = mockPhoneLayout();
    const user = userEvent.setup();
    const onRowClick = jest.fn();
    renderInShell(
      // A hand-rolled clickable row, as some lists still have.
      // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
      <div onClick={onRowClick}>
        <InfoHint label="Why failed">The image could not be pulled.</InfoHint>
      </div>,
    );

    await user.click(screen.getByRole('button', { name: 'Why failed' }));
    await user.click(await screen.findByText('The image could not be pulled.'));
    expect(onRowClick).not.toHaveBeenCalled();
  });
});
