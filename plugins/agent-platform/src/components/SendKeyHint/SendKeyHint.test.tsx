import { render } from '@testing-library/react';
import {
  SEND_KEY_CAPTIONS,
  sendKeyCaption,
  type SendKeyCaptionOptions,
} from '../../lib/sendKey';
import { SendKeyHint } from './SendKeyHint';

// In a <p>, as a caption's Text renders, so a block element inside a key cap
// is a React nesting error — and that fails the test.
function renderHint(
  options: SendKeyCaptionOptions | undefined,
  touch: boolean,
) {
  const consoleError = jest.spyOn(console, 'error');
  const { container } = render(
    <p>
      <SendKeyHint options={options} touch={touch} />
    </p>,
  );
  expect(consoleError).not.toHaveBeenCalled();
  consoleError.mockRestore();
  return container.querySelector('p')!;
}

// Every caption in use: the default and each box's own wording.
const CAPTIONS: [string, SendKeyCaptionOptions | undefined][] = [
  ['default', undefined],
  ...Object.entries(SEND_KEY_CAPTIONS),
];

describe('SendKeyHint', () => {
  it.each(CAPTIONS)(
    'reads as the caption with a keyboard, keys as caps (%s)',
    (_, options) => {
      const hint = renderHint(options, false);

      expect(hint.textContent).toBe(sendKeyCaption(options, false));
      // Enter, Shift and Enter again.
      const keys = Array.from(hint.querySelectorAll('kbd'));
      expect(keys.map(key => key.textContent)).toEqual([
        'Enter',
        'Shift',
        'Enter',
      ]);
      // Enter is drawn as the Return icon; its name is for screen readers.
      expect(keys[0].querySelector('svg')).not.toBeNull();
    },
  );

  it.each(CAPTIONS)('is the plain tap caption on touch (%s)', (_, options) => {
    const hint = renderHint(options, true);

    expect(hint.textContent).toBe(sendKeyCaption(options, true));
    expect(hint.querySelector('kbd')).toBeNull();
  });

  it('draws no key caps on touch, even where the words name Enter', () => {
    const hint = renderHint(
      { tap: 'Tap Enter on the keyboard to go on' },
      true,
    );

    expect(hint.textContent).toBe('Tap Enter on the keyboard to go on.');
    expect(hint.querySelector('kbd')).toBeNull();
  });
});
