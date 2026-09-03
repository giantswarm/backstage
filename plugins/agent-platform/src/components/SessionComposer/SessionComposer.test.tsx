import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { MESSAGE_TEXT_MAX_LENGTH, SessionComposer } from './SessionComposer';

const onSubmit = jest.fn();

function renderComposer(
  props: Partial<Parameters<typeof SessionComposer>[0]> = {},
) {
  return render(
    <SessionComposer
      isAgentWorking={false}
      isFinished={false}
      onSubmit={onSubmit}
      {...props}
    />,
  );
}

const field = () => screen.getByRole('textbox', { name: 'Message' });
const sendButton = () => screen.getByRole('button', { name: 'Send' });

beforeEach(() => {
  onSubmit.mockReset();
});

describe('SessionComposer', () => {
  it('submits the trimmed message', async () => {
    renderComposer();

    await userEvent.type(field(), '  why is the ingress failing?  ');
    await userEvent.click(sendButton());

    expect(onSubmit).toHaveBeenCalledWith('why is the ingress failing?');
  });

  it('clears the field on submit', async () => {
    // Cleared on submit rather than on success: the message is rendered into the
    // conversation at the same moment, and a turn runs for minutes — far too long
    // to hold the user's text in a disabled box.
    renderComposer();

    await userEvent.type(field(), 'hello');
    await userEvent.click(sendButton());

    expect(field()).toHaveValue('');
  });

  it('keeps interior formatting while trimming the ends', async () => {
    renderComposer();

    await userEvent.type(field(), 'line one{Shift>}{Enter}{/Shift}line two');
    await userEvent.click(sendButton());

    expect(onSubmit).toHaveBeenCalledWith('line one\nline two');
  });

  it('will not submit an empty or whitespace-only message', async () => {
    renderComposer();

    expect(sendButton()).toBeDisabled();

    await userEvent.type(field(), '   ');

    expect(sendButton()).toBeDisabled();
  });

  it('sends on Enter and breaks the line on Shift+Enter', async () => {
    // Slack's rule, and Claude's: a multi-line reply is Shift+Enter, not Enter.
    renderComposer();

    await userEvent.type(
      field(),
      'first line{Shift>}{Enter}{/Shift}second line',
    );
    expect(onSubmit).not.toHaveBeenCalled();
    expect(field()).toHaveValue('first line\nsecond line');

    await userEvent.keyboard('{Enter}');

    expect(onSubmit).toHaveBeenCalledWith('first line\nsecond line');
    expect(field()).toHaveValue('');
  });

  it('still sends on Cmd/Ctrl+Enter, the key it used to be', async () => {
    renderComposer();

    await userEvent.type(field(), 'hello');
    await userEvent.keyboard('{Control>}{Enter}{/Control}');

    expect(onSubmit).toHaveBeenCalledWith('hello');
  });

  it('does nothing on Enter with nothing to send — no newline either', async () => {
    renderComposer();

    await userEvent.type(field(), '   {Enter}');

    expect(onSubmit).not.toHaveBeenCalled();
    expect(field()).toHaveValue('   ');
  });

  it('leaves an Enter that commits an IME composition alone', () => {
    // Typing Japanese, Enter confirms the candidate the user is choosing; sending
    // then would fire the message with the last word missing.
    renderComposer();

    fireEvent.change(field(), { target: { value: '日本' } });
    fireEvent.keyDown(field(), { key: 'Enter', isComposing: true });

    expect(onSubmit).not.toHaveBeenCalled();
    expect(field()).toHaveValue('日本');
  });

  it('withholds sending while the agent is working, but not typing', async () => {
    // kagent has no notion of a queued follow-up, so a second message mid-turn
    // competes with the first rather than queueing behind it. The box itself stays
    // editable: a disabled field is blurred by the browser, and every send used to
    // end with a click back into the box — and a draft of the next message is a
    // reasonable thing to type while waiting.
    renderComposer({ isAgentWorking: true });

    expect(field()).toBeEnabled();
    await userEvent.type(field(), 'next question{Enter}');

    expect(onSubmit).not.toHaveBeenCalled();
    expect(field()).toHaveValue('next question');
    expect(sendButton()).toBeDisabled();
    expect(
      screen.getByText(
        /agent is working. You can reply once this turn finishes/,
      ),
    ).toBeInTheDocument();
  });

  it('keeps the focus in the box across a send', async () => {
    // Reported by the first colleague to try the chat: after every send the box
    // had to be clicked again, because it was disabled for the agent's turn.
    const { rerender } = renderComposer();

    await userEvent.type(field(), 'first{Enter}');
    expect(onSubmit).toHaveBeenCalledWith('first');
    rerender(
      <SessionComposer isAgentWorking isFinished={false} onSubmit={onSubmit} />,
    );

    expect(field()).toHaveFocus();
  });

  it('puts a failed message back ahead of a draft typed since', async () => {
    // The box is editable during the turn, so the next message may already be in
    // it when this one fails; overwriting the draft would lose words to save words.
    const { rerender } = renderComposer();

    await userEvent.type(field(), 'the failed one{Enter}');
    rerender(
      <SessionComposer isAgentWorking isFinished={false} onSubmit={onSubmit} />,
    );
    await userEvent.type(field(), 'a draft');

    rerender(
      <SessionComposer
        isAgentWorking={false}
        isFinished={false}
        onSubmit={onSubmit}
        error="kagent said no"
        restore={{ messageId: 'msg-1', text: 'the failed one' }}
      />,
    );

    expect(field()).toHaveValue('the failed one\n\na draft');
  });

  describe('focus', () => {
    it('is not taken on mount by default', () => {
      renderComposer();

      expect(field()).not.toHaveFocus();
    });

    it('is taken on mount when asked, for the page a started session lands on', () => {
      renderComposer({ autoFocus: true });

      expect(field()).toHaveFocus();
    });

    it('comes back when the field is re-enabled and nothing else has it', async () => {
      // The user answered the agent's question from the panel above with Enter;
      // the panel unmounted with the control that had the focus, which fell to
      // <body>. Pulling it into the box is where the conversation continues.
      const { rerender } = renderComposer({
        disabledReason: 'Answer the question above.',
      });
      expect(field()).toBeDisabled();
      expect(document.body).toHaveFocus();

      rerender(
        <SessionComposer
          isAgentWorking={false}
          isFinished={false}
          onSubmit={onSubmit}
        />,
      );

      expect(field()).toBeEnabled();
      expect(field()).toHaveFocus();
    });

    it('does not take the focus from a control the user moved to', async () => {
      const { rerender } = renderComposer({
        disabledReason: 'Answer the question above.',
      });
      const elsewhere = document.createElement('button');
      elsewhere.textContent = 'Elsewhere';
      document.body.appendChild(elsewhere);
      elsewhere.focus();
      expect(elsewhere).toHaveFocus();

      rerender(
        <SessionComposer
          isAgentWorking={false}
          isFinished={false}
          onSubmit={onSubmit}
        />,
      );

      expect(elsewhere).toHaveFocus();
      elsewhere.remove();
    });
  });

  it('says that sending resumes a finished session', () => {
    renderComposer({ isFinished: true });

    expect(
      screen.getByPlaceholderText('Send a message to resume this session…'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Sending a message resumes this finished session.'),
    ).toBeInTheDocument();
  });

  it('describes an ongoing session as a conversation to add to', () => {
    renderComposer();

    expect(
      screen.getByPlaceholderText('Send a message to this session…'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Your reply is added to the conversation/),
    ).toBeInTheDocument();
  });

  it('refuses an over-long message and says how long it is', async () => {
    renderComposer();

    // Set through fireEvent-style typing would take a very long time; paste
    // instead, which is also how a message this size realistically arrives.
    await userEvent.click(field());
    await userEvent.paste('x'.repeat(MESSAGE_TEXT_MAX_LENGTH + 5));

    expect(sendButton()).toBeDisabled();
    expect(
      screen.getByText(
        `That message is ${MESSAGE_TEXT_MAX_LENGTH + 5} characters; the limit is ${MESSAGE_TEXT_MAX_LENGTH}.`,
      ),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('puts a failed message’s text back in the box', async () => {
    // The field clears on submit and the optimistic copy is dropped on failure, so
    // without this the text is gone for good — the case the generous length limit
    // exists to permit.
    const { rerender } = renderComposer();

    await userEvent.type(field(), 'a long and expensive prompt');
    await userEvent.click(sendButton());
    expect(field()).toHaveValue('');

    rerender(
      <SessionComposer
        isAgentWorking={false}
        isFinished={false}
        onSubmit={onSubmit}
        error="kagent said no"
        restore={{ messageId: 'msg-1', text: 'a long and expensive prompt' }}
      />,
    );

    expect(field()).toHaveValue('a long and expensive prompt');
    expect(screen.getByText('kagent said no')).toBeInTheDocument();
  });

  it('restores the same text again after a second failure', async () => {
    // Keyed on the attempt's id, not the text: resubmitting an identical message
    // and failing again has to hand it back a second time.
    const { rerender } = renderComposer({
      restore: { messageId: 'msg-1', text: 'same text' },
    });
    expect(field()).toHaveValue('same text');

    await userEvent.click(sendButton());
    expect(field()).toHaveValue('');

    rerender(
      <SessionComposer
        isAgentWorking={false}
        isFinished={false}
        onSubmit={onSubmit}
        restore={{ messageId: 'msg-2', text: 'same text' }}
      />,
    );

    expect(field()).toHaveValue('same text');
  });

  it('does not overwrite an edit in progress by restoring twice', async () => {
    const { rerender } = renderComposer({
      restore: { messageId: 'msg-1', text: 'restored' },
    });
    expect(field()).toHaveValue('restored');

    await userEvent.clear(field());
    await userEvent.type(field(), 'something else entirely');

    // An unrelated rerender carrying the same failed attempt.
    rerender(
      <SessionComposer
        isAgentWorking={false}
        isFinished={false}
        onSubmit={onSubmit}
        restore={{ messageId: 'msg-1', text: 'restored' }}
      />,
    );

    expect(field()).toHaveValue('something else entirely');
  });

  it('shows why a send failed', () => {
    renderComposer({ error: 'kagent said no' });

    expect(screen.getByText('Message not sent')).toBeInTheDocument();
    expect(screen.getByText('kagent said no')).toBeInTheDocument();
  });
});
