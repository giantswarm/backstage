import { act, render, screen } from '@testing-library/react';
import { useMediaQuery } from '@material-ui/core';
import {
  PHONE_MAX_WIDTH,
  PHONE_MEDIA,
  PHONE_QUERY,
  TOUCH_MEDIA,
  TWO_COLUMN_MEDIA,
  TWO_COLUMN_MIN_WIDTH,
  usePhoneLayout,
  useTouchInput,
} from './breakpoints';
import {
  evaluateMediaQuery,
  mockDesktopLayout,
  MockedLayout,
  mockPhoneLayout,
} from './mockPhoneLayout';

function Probe() {
  const phone = usePhoneLayout();
  const touch = useTouchInput();
  // MUI v4's `down('xs')`, which the shell's rail/bottom-bar swap answers.
  const muiXsDown = useMediaQuery('@media (max-width:599.95px)');
  return (
    <p>
      {phone ? 'phone' : 'wide'} {touch ? 'touch' : 'mouse'}{' '}
      {muiXsDown ? 'mui-xs' : 'mui-up'}
    </p>
  );
}

describe('breakpoints', () => {
  let layout: MockedLayout | undefined;
  afterEach(() => {
    layout?.restore();
    layout = undefined;
  });

  it('is one set: phone up to MUI xs, two columns from bui sm', () => {
    expect(PHONE_MAX_WIDTH).toBe(599.95);
    expect(PHONE_MEDIA).toBe('@media (max-width: 599.95px)');
    expect(TWO_COLUMN_MIN_WIDTH).toBe(768);
    expect(TWO_COLUMN_MEDIA).toBe('@media (min-width: 768px)');
    expect(TOUCH_MEDIA).toBe('@media (hover: none) and (pointer: coarse)');
  });

  it('answers false without matchMedia, as jsdom has none', () => {
    expect(window.matchMedia).toBeUndefined();
    render(<Probe />);
    expect(screen.getByText('wide mouse mui-up')).toBeInTheDocument();
  });

  it('answers for a phone, in step with MUI’s xs query', () => {
    layout = mockPhoneLayout();
    render(<Probe />);
    expect(screen.getByText('phone touch mui-xs')).toBeInTheDocument();
  });

  it('answers for a desktop', () => {
    layout = mockDesktopLayout();
    render(<Probe />);
    expect(screen.getByText('wide mouse mui-up')).toBeInTheDocument();
  });

  it('tells a narrow desktop window from a tablet', () => {
    layout = mockPhoneLayout({ touch: false });
    const { unmount } = render(<Probe />);
    expect(screen.getByText('phone mouse mui-xs')).toBeInTheDocument();
    unmount();
    layout.restore();

    layout = mockDesktopLayout({ width: 820, touch: true });
    render(<Probe />);
    expect(screen.getByText('wide touch mui-up')).toBeInTheDocument();
  });

  it('follows the viewport across the breakpoint, live', () => {
    layout = mockPhoneLayout();
    render(<Probe />);
    expect(screen.getByText(/^phone/)).toBeInTheDocument();

    act(() => layout!.setWidth(600));
    expect(screen.getByText(/^wide/)).toBeInTheDocument();

    act(() => layout!.setWidth(599));
    expect(screen.getByText(/^phone/)).toBeInTheDocument();

    act(() => layout!.setTouch(false));
    expect(screen.getByText(/mouse/)).toBeInTheDocument();
  });

  it('restores jsdom’s missing matchMedia and innerWidth', () => {
    const before = window.innerWidth;
    layout = mockPhoneLayout();
    expect(window.innerWidth).toBe(375);
    layout.restore();
    layout = undefined;
    expect(window.matchMedia).toBeUndefined();
    expect(window.innerWidth).toBe(before);
  });

  it('evaluates the queries the portal writes', () => {
    const phone = { width: 375, touch: true };
    const desktop = { width: 1280, touch: false };
    expect(evaluateMediaQuery(PHONE_QUERY, phone)).toBe(true);
    expect(evaluateMediaQuery(PHONE_MEDIA, desktop)).toBe(false);
    expect(evaluateMediaQuery(TWO_COLUMN_MEDIA, desktop)).toBe(true);
    expect(evaluateMediaQuery('(max-width:599.95px)', phone)).toBe(true);
    expect(evaluateMediaQuery('screen and (min-width: 600px)', phone)).toBe(
      false,
    );
    expect(evaluateMediaQuery('print', desktop)).toBe(false);
    expect(evaluateMediaQuery('(hover: hover)', desktop)).toBe(true);
    expect(evaluateMediaQuery('not all and (pointer: coarse)', phone)).toBe(
      false,
    );
    expect(
      evaluateMediaQuery('(max-width: 400px), (pointer: coarse)', {
        width: 800,
        touch: true,
      }),
    ).toBe(true);
  });
});
