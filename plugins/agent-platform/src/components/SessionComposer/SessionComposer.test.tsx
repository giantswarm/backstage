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

  it('is withheld while the agent is working', async () => {
    // kagent has no notion of a queued follow-up, so a second message mid-turn
    // competes with the first rather than queueing behind it.
    renderComposer({ isAgentWorking: true });

    expect(field()).toBeDisabled();
    expect(sendButton()).toBeDisabled();
    expect(
      screen.getByText(
        /agent is working. You can reply once this turn finishes/,
      ),
    ).toBeInTheDocument();
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
