import { render } from '@testing-library/react';
import { sendKeyCaption, type SendKeyCaptionOptions } from '../../lib/sendKey';
import { SendKeyHint } from './SendKeyHint';

function renderHint(
  options: SendKeyCaptionOptions | undefined,
  touch: boolean,
) {
  const { container } = render(
    <p>
      <SendKeyHint options={options} touch={touch} />
    </p>,
  );
  return container.querySelector('p')!;
}

// The overrides the composers pass, and the default.
const CAPTIONS: [string, SendKeyCaptionOptions | undefined][] = [
  ['the default', undefined],
  [
    'the new-session composer',
    {
      key: 'Enter starts the session with this message',
      tap: 'Tap the arrow to start the session with this message',
    },
  ],
  [
    'a paged question',
    { key: 'Enter goes to the next question', tap: 'Tap Next to go on' },
  ],
  [
    'a lost runtime',
    { key: 'Enter starts it', tap: 'Tap the button below to start it' },
  ],
];

describe('SendKeyHint', () => {
  it.each(CAPTIONS)(
    'reads as the caption with a keyboard, keys as caps, for %s',
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

  it.each(CAPTIONS)(
    'is the plain tap caption on touch, for %s',
    (_, options) => {
      const hint = renderHint(options, true);

      expect(hint.textContent).toBe(sendKeyCaption(options, true));
      expect(hint.querySelector('kbd')).toBeNull();
    },
  );
});
