import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EffectBadge } from '../EffectBadge';
import { WorkflowEffectBadge } from './WorkflowEffectBadge';

describe('WorkflowEffectBadge', () => {
  it('says what a workflow does in the tool badge’s words', () => {
    render(
      <>
        <WorkflowEffectBadge effect="reads" />
        <WorkflowEffectBadge effect="changes" />
      </>,
    );
    expect(screen.getByText('Reads').closest('.bui-Badge')).not.toBeNull();
    expect(
      screen.getByText('Changes things').closest('.bui-Badge'),
    ).not.toBeNull();
  });

  it('shows what that means for its steps on keyboard focus, until Escape', async () => {
    render(<WorkflowEffectBadge effect="reads" />);
    expect(screen.queryByRole('tooltip')).toBeNull();

    await userEvent.tab();
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Every step only reads.',
    );

    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
  });

  it('shows it on hover and on a tap, without the press reaching the row', async () => {
    const onRowClick = jest.fn();
    render(
      // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
      <div onClick={onRowClick}>
        <WorkflowEffectBadge effect="changes" />
      </div>,
    );
    const badge = screen.getByText('Changes things').closest('[tabindex]')!;

    fireEvent.mouseEnter(badge);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'At least one step can change things.',
    );
    fireEvent.mouseLeave(badge);
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());

    fireEvent.click(badge);
    expect(await screen.findByRole('tooltip')).toBeInTheDocument();
    expect(onRowClick).not.toHaveBeenCalled();

    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
  });

  it('is described by the hint for a screen reader', () => {
    render(<WorkflowEffectBadge effect="changes" />);
    expect(
      screen.getByText('Changes things').closest('[tabindex]'),
    ).toHaveAccessibleDescription('At least one step can change things.');
  });

  it('leaves a tool’s badge without a hint or a tab stop', async () => {
    render(<EffectBadge effect="reads" />);
    await userEvent.tab();
    expect(document.body).toHaveFocus();
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});
