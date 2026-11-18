import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  JUMP_TO_BOTTOM_LABEL,
  JumpToBottom,
  NEW_CONTENT_ANNOUNCEMENT,
} from './JumpToBottom';

function dockWithBox(): HTMLElement {
  const dock = document.createElement('div');
  const box = document.createElement('textarea');
  box.setAttribute('aria-label', 'Message');
  dock.appendChild(box);
  document.body.appendChild(dock);
  return dock;
}

describe('JumpToBottom', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('shows nothing while there is nothing new below', () => {
    render(<JumpToBottom isShown={false} onJump={jest.fn()} dock={null} />);
    expect(
      screen.queryByRole('button', { name: JUMP_TO_BOTTOM_LABEL }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(NEW_CONTENT_ANNOUNCEMENT),
    ).not.toBeInTheDocument();
  });

  it('offers the way down and says so politely', () => {
    const { rerender } = render(
      <JumpToBottom isShown={false} onJump={jest.fn()} dock={null} />,
    );
    // The live region is there before its text, so the text is announced.
    const region = document.querySelector('[aria-live="polite"]');
    expect(region).toBeInTheDocument();

    rerender(<JumpToBottom isShown onJump={jest.fn()} dock={null} />);
    expect(
      screen.getByRole('button', { name: JUMP_TO_BOTTOM_LABEL }),
    ).toBeInTheDocument();
    expect(region).toHaveTextContent(NEW_CONTENT_ANNOUNCEMENT);
  });

  it('jumps when pressed', async () => {
    const onJump = jest.fn();
    render(<JumpToBottom isShown onJump={onJump} dock={null} />);
    await userEvent.click(
      screen.getByRole('button', { name: JUMP_TO_BOTTOM_LABEL }),
    );
    expect(onJump).toHaveBeenCalledTimes(1);
  });

  it('moves the focus on to the composer after a key press', async () => {
    const dock = dockWithBox();
    const onJump = jest.fn();
    render(<JumpToBottom isShown onJump={onJump} dock={dock} />);
    const button = screen.getByRole('button', { name: JUMP_TO_BOTTOM_LABEL });
    // Reached by Tab (the dock in this test comes first in the document).
    act(() => button.focus());
    expect(button).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(onJump).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveFocus();
  });

  it('moves the focus on to the dock’s first control while its box is disabled', async () => {
    // A question card's answers, with the composer's box disabled under it.
    const dock = dockWithBox();
    dock.querySelector('textarea')!.disabled = true;
    const answer = document.createElement('button');
    answer.textContent = 'Approve';
    dock.appendChild(answer);
    render(<JumpToBottom isShown onJump={jest.fn()} dock={dock} />);
    act(() =>
      screen.getByRole('button', { name: JUMP_TO_BOTTOM_LABEL }).focus(),
    );
    await userEvent.keyboard('{Enter}');
    expect(answer).toHaveFocus();
  });

  it('moves the focus on to the dock itself when it offers nothing to focus', async () => {
    const dock = dockWithBox();
    dock.querySelector('textarea')!.disabled = true;
    render(<JumpToBottom isShown onJump={jest.fn()} dock={dock} />);
    act(() =>
      screen.getByRole('button', { name: JUMP_TO_BOTTOM_LABEL }).focus(),
    );
    await userEvent.keyboard('{Enter}');
    expect(dock).toHaveFocus();
    expect(document.body).not.toHaveFocus();
  });

  it('leaves the focus alone after a click', async () => {
    const dock = dockWithBox();
    render(<JumpToBottom isShown onJump={jest.fn()} dock={dock} />);
    await userEvent.click(
      screen.getByRole('button', { name: JUMP_TO_BOTTOM_LABEL }),
    );
    expect(screen.getByRole('textbox', { name: 'Message' })).not.toHaveFocus();
  });
});
