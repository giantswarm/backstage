// The token test runs in Node and reads stylesheets; nothing of it is bundled.
// eslint-disable-next-line no-restricted-imports
import { readFileSync } from 'fs';
// eslint-disable-next-line no-restricted-imports
import { dirname, join } from 'path';
import { render, screen } from '@testing-library/react';
import {
  RAIL_COLLAPSED_WIDTH,
  RAIL_DEFAULT_WIDTH,
  RAIL_WIDTH_STORAGE_KEY,
  RailWidthProvider,
  useRailWidth,
} from './RailWidthProvider';

function Width() {
  const { width } = useRailWidth();
  return <output>{width}</output>;
}

function renderProvider(active: boolean) {
  const view = render(
    <RailWidthProvider active={active}>
      <Width />
    </RailWidthProvider>,
  );
  return {
    width: () => Number(screen.getByRole('status').textContent),
    activate: () =>
      view.rerender(
        <RailWidthProvider active>
          <Width />
        </RailWidthProvider>,
      ),
  };
}

describe('RailWidthProvider', () => {
  let getItem: jest.SpyInstance;
  let setItem: jest.SpyInstance;
  let removeItem: jest.SpyInstance;
  let addEventListener: jest.SpyInstance;

  beforeEach(() => {
    window.localStorage.setItem(RAIL_WIDTH_STORAGE_KEY, '320');
    getItem = jest.spyOn(Storage.prototype, 'getItem');
    setItem = jest.spyOn(Storage.prototype, 'setItem');
    removeItem = jest.spyOn(Storage.prototype, 'removeItem');
    addEventListener = jest.spyOn(window, 'addEventListener');
  });
  afterEach(() => {
    jest.restoreAllMocks();
    window.localStorage.clear();
  });

  const resizeListeners = () =>
    addEventListener.mock.calls.filter(([type]) => type === 'resize');

  it('does no work off the shell: no storage, no window listener', () => {
    const { width } = renderProvider(false);

    expect(width()).toBe(RAIL_DEFAULT_WIDTH);
    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    expect(resizeListeners()).toHaveLength(0);
  });

  it('reads the remembered width once and writes nothing on mount', () => {
    const { width } = renderProvider(true);

    expect(width()).toBe(320);
    expect(getItem).toHaveBeenCalledTimes(1);
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    expect(resizeListeners()).toHaveLength(1);
  });

  it('has the remembered width from the shell’s first render on', () => {
    const { width, activate } = renderProvider(false);

    activate();

    expect(width()).toBe(320);
    expect(setItem).not.toHaveBeenCalled();
  });
});

describe('RAIL_COLLAPSED_WIDTH', () => {
  // The constant spells bui's --bui-space-2 and MUI's small icon in px; the
  // collapsed rail's icons leave its axis if either changes under it.
  it('matches the tokens it is made of', () => {
    // By path: Jest maps a required stylesheet to a stub.
    const bui = readFileSync(
      join(
        dirname(require.resolve('@backstage/ui/package.json')),
        'dist/css/styles.css',
      ),
      'utf8',
    );
    expect(bui).toMatch(/--bui-space:\s*0\.25rem;/);
    expect(bui).toMatch(
      /--bui-space-2:\s*calc\(var\(--bui-space\)\s*\*\s*2\);/,
    );
    // Nor does the shell's theme change the scale.
    const shell = readFileSync(join(__dirname, '../agent-shell.css'), 'utf8');
    expect(shell).not.toMatch(/--bui-space(-2)?:/);
    // One 20px icon item in 8px padding, 8px rail padding either side, the
    // 1px border.
    expect(RAIL_COLLAPSED_WIDTH).toBe(20 + 2 * 8 + 2 * 8 + 1);
  });
});
