import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HintTooltip } from './HintTooltip';

describe('HintTooltip', () => {
  it('opens on keyboard focus and closes on Escape', async () => {
    render(<HintTooltip hint="Every step only reads.">Reads</HintTooltip>);
    expect(screen.queryByRole('tooltip')).toBeNull();

    await userEvent.tab();
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Every step only reads.',
    );

    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
  });

  it('opens on a tap without the press reaching the row, and closes on a press elsewhere', async () => {
    const onRowClick = jest.fn();
    render(
      // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
      <div onClick={onRowClick}>
        <HintTooltip hint="The hint">Badge</HintTooltip>
      </div>,
    );
    const trigger = screen.getByText('Badge');

    fireEvent.click(trigger);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('The hint');
    expect(onRowClick).not.toHaveBeenCalled();

    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
  });

  it.each(['{Enter}', ' '])(
    'keeps %s on the trigger off the row it sits in',
    async key => {
      const onRowKeyDown = jest.fn();
      render(
        // eslint-disable-next-line jsx-a11y/no-static-element-interactions
        <div onKeyDown={onRowKeyDown}>
          <HintTooltip hint="The hint">Badge</HintTooltip>
        </div>,
      );

      await userEvent.tab();
      await userEvent.keyboard(key);
      expect(onRowKeyDown).not.toHaveBeenCalled();
    },
  );

  it('keeps one hint open at a time', async () => {
    const user = userEvent.setup();
    render(
      <>
        <HintTooltip hint="First">One</HintTooltip>
        <HintTooltip hint="Second">Two</HintTooltip>
      </>,
    );
    await user.tab();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('First');

    await user.hover(screen.getByText('Two'));
    await waitFor(() => expect(screen.getAllByRole('tooltip')).toHaveLength(1));
    expect(screen.getByRole('tooltip')).toHaveTextContent('Second');
  });

  it('describes the trigger with the hint for a screen reader', () => {
    render(<HintTooltip hint="Every step only reads.">Reads</HintTooltip>);
    const trigger = screen.getByText('Reads');
    expect(trigger).toHaveAttribute('tabindex', '0');
    expect(trigger).toHaveAccessibleDescription('Every step only reads.');
  });

  it('names a trigger that has no name of its own, described by the description only', () => {
    render(
      <HintTooltip
        label="GitHub"
        hint={'GitHub\nAll tools'}
        description="All tools"
      >
        <span aria-hidden>G</span>
      </HintTooltip>,
    );
    const trigger = screen.getByRole('img', { name: 'GitHub' });
    expect(trigger).toHaveAttribute('tabindex', '0');
    expect(trigger).toHaveAccessibleDescription('All tools');
  });

  it('does not repeat the label as the description', () => {
    render(
      <HintTooltip label="GitHub" hint="GitHub">
        <span aria-hidden>G</span>
      </HintTooltip>,
    );
    expect(screen.getByRole('img', { name: 'GitHub' })).not.toHaveAttribute(
      'aria-describedby',
    );
  });
});
