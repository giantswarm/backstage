import {
  act,
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  mockDesktopLayout,
  mockPhoneLayout,
  type MockedLayout,
} from '@giantswarm/backstage-plugin-ui-react/testUtils';
import { sendKeyCaption } from '../../lib/sendKey';
import {
  mockImageEncoding,
  pngFile,
  TINY_PNG_BASE64,
} from '../../lib/__fixtures__/images';
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
  it('carries an attached card directly above the box, under its notices', () => {
    // T40: the agent's pending question docks with the box as one control.
    renderComposer({
      attachment: <div data-testid="attached-card">Which cluster?</div>,
      disabledReason: 'Answer the question above to continue.',
      error: 'boom',
    });

    const card = screen.getByTestId('attached-card');
    const box = screen.getByTestId('composer-card');
    const notice = screen.getByText('Message not sent');
    // eslint-disable-next-line no-bitwise
    const follows = (a: Node, b: Node) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(notice, card)).toBe(true);
    expect(follows(card, box)).toBe(true);
    // Outside the box's own form: the real card is a form, and forms do not nest.
    expect(card.closest('form')).toBeNull();
    expect(field()).toBeDisabled();
  });

  it('submits the trimmed message', async () => {
    renderComposer();

    await userEvent.type(field(), '  why is the ingress failing?  ');
    await userEvent.click(sendButton());

    expect(onSubmit).toHaveBeenCalledWith('why is the ingress failing?', []);
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

    expect(onSubmit).toHaveBeenCalledWith('line one\nline two', []);
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

    expect(onSubmit).toHaveBeenCalledWith('first line\nsecond line', []);
    expect(field()).toHaveValue('');
  });

  it('still sends on Cmd/Ctrl+Enter, the key it used to be', async () => {
    renderComposer();

    await userEvent.type(field(), 'hello');
    await userEvent.keyboard('{Control>}{Enter}{/Control}');

    expect(onSubmit).toHaveBeenCalledWith('hello', []);
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
    expect(onSubmit).toHaveBeenCalledWith('first', []);
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

  it('invites a reply to the agent once its turn ended, never to "resume"', () => {
    renderComposer({ isFinished: true, agentName: 'Lab Helper' });

    expect(
      screen.getByPlaceholderText('Reply to Lab Helper…'),
    ).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/resume/)).not.toBeInTheDocument();
    // Between turns is the usual state of a session, so the caption is the
    // prototype's disclaimer there too; the placeholder says what Send does.
    expect(
      screen.getByText('Agents can make mistakes. Check important results.'),
    ).toBeInTheDocument();
  });

  it('carries the prototype’s disclaimer under an idle box', () => {
    renderComposer();

    expect(
      screen.getByPlaceholderText('Send a message to this session…'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Agents can make mistakes. Check important results.'),
    ).toBeInTheDocument();
  });

  it('gives the disclaimer way to what is happening while the agent works', () => {
    renderComposer({ isAgentWorking: true });

    expect(
      screen.queryByText('Agents can make mistakes. Check important results.'),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/The agent is working/)).toBeInTheDocument();
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

  it('renders the details slot inside the box, next to the action', async () => {
    // The cost/context chip docks here so it stays on screen with the composer.
    // It must survive every trailing state: beside Send, beside Stop, and when
    // a lost runtime removes Send entirely.
    renderComposer({ details: <span data-testid="details-chip" /> });

    const box = screen.getByTestId('composer-card');
    expect(box).toContainElement(screen.getByTestId('details-chip'));
    expect(sendButton()).toBeInTheDocument();
  });

  it('keeps the details slot when a new session replaces Send', () => {
    renderComposer({
      details: <span data-testid="details-chip" />,
      newSession: {
        label: 'Start a new session with this agent',
        onStart: jest.fn(),
        replacesSend: true,
        caption: 'This session cannot continue.',
      },
    });

    expect(screen.getByTestId('details-chip')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Send' }),
    ).not.toBeInTheDocument();
  });

  it('shows why a send failed', () => {
    renderComposer({ error: 'kagent said no' });

    expect(screen.getByText('Message not sent')).toBeInTheDocument();
    expect(screen.getByText('kagent said no')).toBeInTheDocument();
  });
});

describe('SessionComposer — Stop', () => {
  const stopButton = () =>
    screen.getByRole('button', { name: 'Stop the turn' });

  it('offers Stop in place of Send while the agent works and the turn is known', async () => {
    const onStop = jest.fn();
    renderComposer({ isAgentWorking: true, onStop });

    expect(
      screen.queryByRole('button', { name: 'Send' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        /The agent is working\. Stop the turn, or reply once it finishes\./,
      ),
    ).toBeInTheDocument();

    await userEvent.click(stopButton());

    expect(onStop).toHaveBeenCalledTimes(1);
    // Stopping the turn is not sending: the draft stays where it is.
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('withholds Stop when the running turn is not known yet', () => {
    // The first beat of a send, before the stream or the poll has named the
    // task: Send is withheld as before, and nothing pretends to be stoppable.
    renderComposer({ isAgentWorking: true });

    expect(
      screen.queryByRole('button', { name: 'Stop the turn' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(
      screen.getByText(
        'The agent is working. You can reply once this turn finishes.',
      ),
    ).toBeInTheDocument();
  });

  it('withholds Stop while a confirmation is open', () => {
    // Waiting on a human is the opposite of running; there is nothing to cancel.
    renderComposer({
      isAgentWorking: false,
      disabledReason: "Answer the agent's question above to carry on.",
      onStop: jest.fn(),
    });

    expect(
      screen.queryByRole('button', { name: 'Stop the turn' }),
    ).not.toBeInTheDocument();
  });

  it('shows the stop in progress and refuses a second press', () => {
    renderComposer({
      isAgentWorking: true,
      onStop: jest.fn(),
      isStopping: true,
    });

    // Pending, react-aria names the button "Stop Loading".
    expect(screen.getByRole('button', { name: /^Stop\b/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByText('Stopping the turn…')).toBeInTheDocument();
  });

  it('goes back to Send once the turn has ended', () => {
    const { rerender } = renderComposer({
      isAgentWorking: true,
      onStop: jest.fn(),
    });
    expect(
      screen.getByRole('button', { name: 'Stop the turn' }),
    ).toBeInTheDocument();

    rerender(
      <SessionComposer isAgentWorking={false} isFinished onSubmit={onSubmit} />,
    );

    expect(
      screen.queryByRole('button', { name: 'Stop the turn' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
  });
});

describe('SessionComposer — a stalled turn and a failed Stop', () => {
  it('offers Stop for a turn that has stopped reporting progress, and says so', async () => {
    // The task is still active on the server; the caption stops promising a
    // reply and points at the cancel, and Stop stays in Send's slot.
    const onStop = jest.fn();
    renderComposer({ isAgentWorking: true, isStalled: true, onStop });

    expect(
      screen.getByText(
        'The agent has stopped reporting progress. Stop the turn to send again.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Send' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/reply is added/)).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: 'Stop the turn' }),
    );
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('says a stalled turn ends on its own when its task is not known', () => {
    renderComposer({ isAgentWorking: true, isStalled: true });

    expect(
      screen.getByText(
        'The agent has stopped reporting progress. You can reply once this turn ends.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Stop the turn' }),
    ).not.toBeInTheDocument();
  });

  it('reports a failed Stop as one, not as a message that was not sent', () => {
    renderComposer({
      isAgentWorking: true,
      onStop: jest.fn(),
      stopError: 'Failed user token verification',
    });

    expect(screen.getByText('Could not stop the turn')).toBeInTheDocument();
    expect(
      screen.getByText('Failed user token verification'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Message not sent')).not.toBeInTheDocument();
    // The turn is still running: Stop stays offered for another try.
    expect(
      screen.getByRole('button', { name: 'Stop the turn' }),
    ).toBeInTheDocument();
  });

  it('keeps a failed send and a failed Stop apart', () => {
    renderComposer({
      error: 'kagent said no',
      stopError: 'the cancel was refused',
    });

    expect(screen.getByText('Message not sent')).toBeInTheDocument();
    expect(screen.getByText('kagent said no')).toBeInTheDocument();
    expect(screen.getByText('Could not stop the turn')).toBeInTheDocument();
    expect(screen.getByText('the cancel was refused')).toBeInTheDocument();
  });
});

describe('SessionComposer — the way out of a lost runtime', () => {
  const onStart = jest.fn();
  const newSession = {
    label: 'Start a new session with Grill master',
    onStart,
    caption: 'Sending again retries the runtime.',
  };
  const startButton = () =>
    screen.getByRole('button', {
      name: 'Start a new session with Grill master',
    });

  beforeEach(() => {
    onStart.mockReset();
  });

  it('offers the new session under the box while the loss is only suspected', async () => {
    // A cold worker can time out once, so sending again stays the honest retry
    // and the way out waits below it.
    renderComposer({ newSession, isFinished: true });

    expect(sendButton()).toBeInTheDocument();
    expect(startButton()).toBeEnabled();
    expect(
      screen.getByText('Sending again retries the runtime.'),
    ).toBeInTheDocument();
  });

  it('keeps the way out outside the box, not among its controls', () => {
    // It leaves this session; reading as one of the message box's own controls
    // was the confusion worth a test.
    renderComposer({ newSession, isFinished: true });

    expect(screen.getByTestId('composer-card')).not.toContainElement(
      startButton(),
    );
  });

  it('hands the box’s text to the new session and keeps it in the box', async () => {
    renderComposer({ newSession, isFinished: true });

    await userEvent.type(field(), '  six of them are vegetarian  ');
    await userEvent.click(startButton());

    expect(onStart).toHaveBeenCalledWith('six of them are vegetarian', []);
    // Not cleared: the create can fail, and the box is where the words are.
    expect(field()).toHaveValue('  six of them are vegetarian  ');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('starts with an empty box too — the caller carries the unanswered message', async () => {
    renderComposer({ newSession, isFinished: true });

    await userEvent.click(startButton());

    expect(onStart).toHaveBeenCalledWith('', []);
  });

  it('keeps Enter sending while Send is still offered', async () => {
    renderComposer({ newSession, isFinished: true });

    await userEvent.type(field(), 'try once more{Enter}');

    expect(onSubmit).toHaveBeenCalledWith('try once more', []);
    expect(onStart).not.toHaveBeenCalled();
  });

  it('takes Send’s place, and Enter, once the loss is reported', async () => {
    // A send then fails the same way every time; the one thing that works is
    // what the primary control and Enter should do.
    renderComposer({
      newSession: { ...newSession, replacesSend: true },
      isFinished: true,
    });

    expect(
      screen.queryByRole('button', { name: 'Send' }),
    ).not.toBeInTheDocument();
    expect(field()).toHaveAttribute(
      'placeholder',
      'Start a new session with this message…',
    );

    await userEvent.type(field(), 'six of them are vegetarian{Enter}');

    expect(onStart).toHaveBeenCalledWith('six of them are vegetarian', []);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('withholds the action while the new session is being created', () => {
    renderComposer({
      newSession: { ...newSession, isStarting: true },
      isFinished: true,
    });

    expect(startButton()).toBeDisabled();
  });

  it('is not offered at all without the prop', () => {
    renderComposer();

    expect(
      screen.queryByRole('button', { name: /Start a new session/ }),
    ).not.toBeInTheDocument();
  });
});

describe('SessionComposer on a phone (T22)', () => {
  let layout: MockedLayout;
  afterEach(() => layout.restore());

  const waiting = {
    attachment: <div data-testid="attached-card">Which cluster?</div>,
    disabledReason:
      'Issue tracker is waiting for your answer. Answer the question above to continue.',
    details: <button type="button">Session cost</button>,
  };

  it('folds the disabled box to its caption while a card is attached', () => {
    layout = mockPhoneLayout();
    renderComposer(waiting);

    expect(screen.getByTestId('attached-card')).toBeInTheDocument();
    expect(
      screen.queryByRole('textbox', { name: 'Message' }),
    ).not.toBeInTheDocument();
    const folded = screen.getByTestId('composer-folded');
    expect(folded).toHaveTextContent(waiting.disabledReason);
    // The cost chip stays in reach while the box is folded.
    expect(
      screen.getByRole('button', { name: 'Session cost' }),
    ).toBeInTheDocument();
  });

  it('brings the box back, with its draft and the focus, when the card goes', async () => {
    layout = mockPhoneLayout();
    const { rerender } = renderComposer();
    await userEvent.type(field(), 'half a thought');

    rerender(
      <SessionComposer
        isAgentWorking={false}
        isFinished={false}
        onSubmit={onSubmit}
        {...waiting}
      />,
    );
    expect(
      screen.queryByRole('textbox', { name: 'Message' }),
    ).not.toBeInTheDocument();
    act(() => (document.activeElement as HTMLElement | null)?.blur());

    rerender(
      <SessionComposer
        isAgentWorking={false}
        isFinished={false}
        onSubmit={onSubmit}
      />,
    );
    expect(field()).toHaveValue('half a thought');
    expect(field()).toHaveFocus();
  });

  it('keeps the disabled box under the card on a desktop', () => {
    layout = mockDesktopLayout();
    renderComposer(waiting);

    expect(field()).toBeDisabled();
    expect(screen.queryByTestId('composer-folded')).not.toBeInTheDocument();
  });

  it('breaks the line on Enter with touch input, and sends from the button', async () => {
    layout = mockPhoneLayout();
    renderComposer();

    await userEvent.type(field(), 'first line{Enter}second line');
    expect(onSubmit).not.toHaveBeenCalled();
    expect(field()).toHaveValue('first line\nsecond line');
    // The soft keyboard's Enter key says it breaks the line.
    expect(field()).toHaveAttribute('enterkeyhint', 'enter');

    await userEvent.click(sendButton());
    expect(onSubmit).toHaveBeenCalledWith('first line\nsecond line', []);
  });

  it('labels the Enter key "send" with a keyboard', () => {
    layout = mockDesktopLayout();
    renderComposer();

    expect(field()).toHaveAttribute('enterkeyhint', 'send');
  });
});

describe('SessionComposer send-key hint', () => {
  let layout: MockedLayout;
  afterEach(() => layout.restore());

  const hint = () => screen.queryByTestId('send-key-hint');

  it('says how the box sends beside the disclaimer, with key caps', () => {
    layout = mockDesktopLayout();
    renderComposer();

    expect(
      screen.getByText('Agents can make mistakes. Check important results.'),
    ).toBeInTheDocument();
    // The same words as the other composers' caption.
    expect(hint()).toBeVisible();
    expect(hint()?.textContent).toBe(sendKeyCaption({}, false));
    expect(hint()?.querySelectorAll('kbd')).toHaveLength(3);
  });

  it('says to tap Send on touch input', () => {
    layout = mockPhoneLayout();
    renderComposer();

    expect(hint()).toBeVisible();
    expect(hint()?.textContent).toBe('Tap Send to send.');
    expect(hint()?.querySelector('kbd')).toBeNull();
  });

  it.each([
    ['the agent works', { isAgentWorking: true }],
    ['a confirmation is open', { disabledReason: 'Answer the question.' }],
    [
      'the runtime is lost',
      {
        newSession: {
          label: 'Start a new session',
          onStart: jest.fn(),
          caption: 'This session cannot continue.',
        },
      },
    ],
  ])('hides the keys while %s, keeping their room', (_, props) => {
    layout = mockDesktopLayout();
    renderComposer(props);

    // Hidden rather than removed, so the docked composer keeps its height
    // from turn to turn.
    expect(hint()).toBeInTheDocument();
    expect(hint()).not.toBeVisible();
  });

  it('gives way to the length error', () => {
    layout = mockDesktopLayout();
    renderComposer();

    fireEvent.change(field(), {
      target: { value: 'x'.repeat(MESSAGE_TEXT_MAX_LENGTH + 1) },
    });

    expect(screen.getByText(/the limit is/)).toBeInTheDocument();
    expect(hint()).not.toBeVisible();
  });
});

describe('SessionComposer — images', () => {
  let encoding: ReturnType<typeof mockImageEncoding>;
  beforeEach(() => {
    encoding = mockImageEncoding();
  });
  afterEach(() => {
    encoding.restore();
  });

  const attachedList = () =>
    screen.queryByRole('list', { name: 'Attached images' });

  /** Paste into the box as a clipboard holding `files` and these types. */
  function paste(files: File[], types: string[] = ['Files']) {
    fireEvent.paste(field(), {
      clipboardData: { files, types, getData: () => '' },
    });
  }

  function dataTransfer(files: File[]) {
    return { files, types: ['Files'], dropEffect: 'none' };
  }

  const pdf = () =>
    new File(['%PDF-1.7'], 'report.pdf', { type: 'application/pdf' });

  const image = (name: string, byteSize = 70) => ({
    id: `image-${name}`,
    name,
    mediaType: 'image/png' as const,
    byteSize,
    previewUrl: `data:image/png;base64,${TINY_PNG_BASE64}`,
  });

  it('attaches a pasted image instead of inserting anything', async () => {
    renderComposer({ images: {} });

    paste([pngFile('image.png')]);

    // Not the browser's `image.png`, which every pasted image is called.
    expect(await screen.findByText('Pasted image.png')).toBeInTheDocument();
    expect(attachedList()).toBeInTheDocument();
    expect(screen.getByText(/^PNG · /)).toBeInTheDocument();
    expect(field()).toHaveValue('');
  });

  it('names each pasted image apart, so each remove control is announced apart', async () => {
    renderComposer({ images: {} });

    paste([pngFile('image.png')]);
    await screen.findByText('Pasted image.png');
    paste([pngFile('image.png')]);

    expect(
      await screen.findByRole('button', {
        name: 'Remove Pasted image (2).png',
      }),
    ).toBeInTheDocument();
  });

  it('leaves a paste of rich text to the box, picture and all', async () => {
    // A spreadsheet copies an image of the cells beside their text.
    renderComposer({ images: {} });

    paste([pngFile()], ['text/plain', 'text/html', 'Files']);

    await act(async () => {});
    expect(attachedList()).not.toBeInTheDocument();
  });

  it('leaves pasted images alone without the images option', async () => {
    renderComposer();

    paste([pngFile()]);

    await act(async () => {});
    expect(attachedList()).not.toBeInTheDocument();
  });

  it('sends the images with the text, and empties the box of both', async () => {
    renderComposer({ images: {} });
    paste([pngFile()]);
    await screen.findByText('Pasted image.png');

    await userEvent.type(field(), 'what is wrong here?');
    await userEvent.click(sendButton());

    expect(onSubmit).toHaveBeenCalledWith('what is wrong here?', [
      expect.objectContaining({
        name: 'Pasted image.png',
        mediaType: 'image/png',
        previewUrl: `data:image/png;base64,${TINY_PNG_BASE64}`,
      }),
    ]);
    expect(attachedList()).not.toBeInTheDocument();
  });

  it('removes an image by its named control, and gives the box the focus back', async () => {
    renderComposer({ images: {} });
    paste([pngFile()]);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Remove Pasted image.png' }),
    );

    expect(attachedList()).not.toBeInTheDocument();
    expect(field()).toHaveFocus();
  });

  it('takes images dropped on the box, with a drop state while they are over it', async () => {
    renderComposer({ images: {} });
    const box = screen.getByTestId('composer-card');
    const files = [pngFile('dropped.png')];

    fireEvent.dragEnter(box, { dataTransfer: dataTransfer(files) });
    expect(box).toHaveAttribute('data-drop-target');
    expect(screen.getByText('Drop images to attach them')).toBeInTheDocument();

    fireEvent.drop(box, { dataTransfer: dataTransfer(files) });

    expect(await screen.findByText('dropped.png')).toBeInTheDocument();
    expect(box).not.toHaveAttribute('data-drop-target');
  });

  it('refuses a dropped file that is not an image, saying what it takes', async () => {
    renderComposer({ images: {} });

    fireEvent.drop(screen.getByTestId('composer-card'), {
      dataTransfer: dataTransfer([pdf()]),
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'report.pdf is not an image the agent can take. Attach a PNG, JPEG, GIF or WebP image.',
    );
    expect(attachedList()).not.toBeInTheDocument();
  });

  it('keeps a refusal that a slower image finishing later would otherwise wipe', async () => {
    let decoded: () => void = () => {};
    encoding.createImageBitmap.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          decoded = () => resolve({ width: 1, height: 1, close: jest.fn() });
        }),
    );
    renderComposer({ images: {} });

    paste([pngFile()]);
    fireEvent.drop(screen.getByTestId('composer-card'), {
      dataTransfer: dataTransfer([pdf()]),
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('report.pdf');

    await waitFor(() => expect(encoding.createImageBitmap).toHaveBeenCalled());
    await act(async () => decoded());

    expect(await screen.findByText('Pasted image.png')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('report.pdf');
  });

  it('takes nothing while the box is disabled, but still keeps a dropped file from opening', () => {
    renderComposer({
      images: {},
      disabledReason: 'Answer the question above to continue.',
    });

    const drop = createEvent.drop(screen.getByTestId('composer-card'), {
      dataTransfer: dataTransfer([pngFile()]),
    });
    fireEvent(screen.getByTestId('composer-card'), drop);
    const elsewhere = createEvent.drop(document.body, {
      dataTransfer: dataTransfer([pngFile()]),
    });
    fireEvent(document.body, elsewhere);

    expect(drop.defaultPrevented).toBe(true);
    expect(elsewhere.defaultPrevented).toBe(true);
    expect(attachedList()).not.toBeInTheDocument();
  });

  it('says why an agent that cannot take images takes none', async () => {
    const reason =
      'Coder cannot take images: its Claude Code runtime accepts text only.';
    renderComposer({ images: { unsupportedReason: reason } });

    paste([pngFile()]);
    expect(await screen.findByRole('alert')).toHaveTextContent(reason);
    expect(attachedList()).not.toBeInTheDocument();

    // There is no button to attach images with: paste and drop only.
    expect(
      screen.queryByRole('button', { name: 'Attach images' }),
    ).not.toBeInTheDocument();
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  it('stops at the bytes the session can still carry', async () => {
    renderComposer({
      images: { session: { bytes: 16 * 1024 * 1024, count: 1 } },
    });

    paste([pngFile()]);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Start a new session to send more images.',
    );
  });

  it('stops at the number of images the session can still carry', async () => {
    renderComposer({ images: { session: { bytes: 0, count: 50 } } });

    paste([pngFile()]);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This session already carries 50 images',
    );
  });

  it('puts a failed message’s images back with its text', async () => {
    const { rerender } = renderComposer({ images: {} });

    rerender(
      <SessionComposer
        isAgentWorking={false}
        isFinished={false}
        onSubmit={onSubmit}
        images={{}}
        restore={{
          messageId: 'm1',
          text: 'look',
          images: [image('restored.png')],
        }}
      />,
    );

    expect(field()).toHaveValue('look');
    expect(screen.getByText('restored.png')).toBeInTheDocument();
  });

  it('holds the send while restored and newer images are more than a message carries, and says so', async () => {
    const { rerender } = renderComposer({ images: {} });
    paste([pngFile()]);
    await screen.findByText('Pasted image.png');

    rerender(
      <SessionComposer
        isAgentWorking={false}
        isFinished={false}
        onSubmit={onSubmit}
        images={{}}
        restore={{
          messageId: 'm1',
          text: 'look',
          images: [image('big.png', 3 * 1024 * 1024)],
        }}
      />,
    );

    expect(screen.getByText('big.png')).toBeInTheDocument();
    expect(screen.getByText('Pasted image.png')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'a message can carry 3 MiB. Remove one, and send it with the next message.',
    );
    expect(sendButton()).toBeDisabled();

    await userEvent.click(
      screen.getByRole('button', { name: 'Remove Pasted image.png' }),
    );
    expect(sendButton()).toBeEnabled();
  });

  it('waits for an image still being read before starting a new session with it', async () => {
    let decoded: () => void = () => {};
    encoding.createImageBitmap.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          decoded = () => resolve({ width: 1, height: 1, close: jest.fn() });
        }),
    );
    const onStart = jest.fn();
    renderComposer({
      images: {},
      newSession: {
        label: 'Start a new session with Coder',
        onStart,
        replacesSend: true,
        caption: 'This session cannot continue.',
      },
    });

    paste([pngFile()]);
    const start = screen.getByRole('button', {
      name: 'Start a new session with Coder',
    });
    expect(start).toBeDisabled();

    await waitFor(() => expect(encoding.createImageBitmap).toHaveBeenCalled());
    await act(async () => decoded());
    await screen.findByText('Pasted image.png');
    await userEvent.click(start);

    expect(onStart).toHaveBeenCalledWith('', [
      expect.objectContaining({ name: 'Pasted image.png' }),
    ]);
  });
});
