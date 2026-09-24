import { fireEvent, render, screen } from '@testing-library/react';
import { ComposerFrame } from './ComposerFrame';

function renderFrame(value = '') {
  return render(
    <ComposerFrame
      minRows={2}
      maxRows={4}
      data-testid="frame"
      input={<textarea aria-label="Message" value={value} readOnly />}
      leading={<button type="button">Agent</button>}
      trailing={<button type="submit">Send</button>}
    />,
  );
}

describe('ComposerFrame', () => {
  it('puts the text field and both controls inside the one box', () => {
    renderFrame();

    const frame = screen.getByTestId('frame');
    expect(frame).toContainElement(screen.getByRole('textbox'));
    expect(frame).toContainElement(
      screen.getByRole('button', { name: 'Agent' }),
    );
    expect(frame).toContainElement(
      screen.getByRole('button', { name: 'Send' }),
    );
  });

  it('sends a press on its own padding to the text field', () => {
    renderFrame();

    fireEvent.mouseDown(screen.getByTestId('frame'));

    expect(screen.getByRole('textbox')).toHaveFocus();
  });

  it('leaves a press on a control to the control', () => {
    renderFrame();

    fireEvent.mouseDown(screen.getByRole('button', { name: 'Agent' }));

    expect(screen.getByRole('textbox')).not.toHaveFocus();
  });

  describe('growing with the content', () => {
    // jsdom lays nothing out, so the line height and the content's height are
    // given: 20px lines, no padding. Read back from the inline style the hook
    // sets, since `toHaveStyle` goes through the stubbed `getComputedStyle`.
    let contentHeight = 0;
    const getComputedStyle = window.getComputedStyle;

    beforeEach(() => {
      jest.spyOn(window, 'getComputedStyle').mockImplementation(
        element =>
          ({
            ...getComputedStyle(element),
            lineHeight: '20px',
            paddingTop: '0px',
            paddingBottom: '0px',
          }) as CSSStyleDeclaration,
      );
      jest
        .spyOn(HTMLTextAreaElement.prototype, 'scrollHeight', 'get')
        .mockImplementation(() => contentHeight);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('keeps the minimum height while the content is shorter', () => {
      contentHeight = 20;
      renderFrame('one line');

      const { style } = screen.getByRole('textbox');
      expect(style.height).toBe('40px');
      expect(style.overflowY).toBe('hidden');
    });

    it('grows to fit the content', () => {
      contentHeight = 60;
      renderFrame('three\nlines\nhere');

      expect(screen.getByRole('textbox').style.height).toBe('60px');
    });

    it('stops at the maximum and scrolls beyond it', () => {
      contentHeight = 200;
      renderFrame('many lines');

      const { style } = screen.getByRole('textbox');
      expect(style.height).toBe('80px');
      expect(style.overflowY).toBe('auto');
    });

    it('grows on typing into an uncontrolled field', () => {
      contentHeight = 20;
      render(
        <ComposerFrame
          minRows={2}
          maxRows={4}
          input={<textarea aria-label="Message" />}
        />,
      );
      expect(screen.getByRole('textbox').style.height).toBe('40px');

      contentHeight = 60;
      fireEvent.input(screen.getByRole('textbox'));

      expect(screen.getByRole('textbox').style.height).toBe('60px');
    });
  });
});
