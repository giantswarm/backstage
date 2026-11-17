import { act, render, screen } from '@testing-library/react';
import {
  mockContainerWidth,
  mockDesktopLayout,
  mockPhoneLayout,
  type MockedContainerWidth,
  type MockedLayout,
} from '../../testUtils';
import { COMPACT_LAYOUT_HYSTERESIS } from './useCompactLayout';
import { useWidthTier } from './useWidthTier';

function Probe() {
  const [ref, tier] = useWidthTier([800, 600]);
  return <div ref={ref}>tier {tier}</div>;
}

describe('useWidthTier', () => {
  let layout: MockedLayout;
  let container: MockedContainerWidth;
  afterEach(() => {
    container.restore();
    layout.restore();
  });

  it('steps down below each minimum and back up only past the margin', () => {
    layout = mockDesktopLayout();
    container = mockContainerWidth(900);
    render(<Probe />);
    expect(screen.getByText('tier 0')).toBeInTheDocument();

    act(() => container.setWidth(700));
    expect(screen.getByText('tier 1')).toBeInTheDocument();
    act(() => container.setWidth(500));
    expect(screen.getByText('tier 2')).toBeInTheDocument();

    act(() => container.setWidth(600 + COMPACT_LAYOUT_HYSTERESIS - 1));
    expect(screen.getByText('tier 2')).toBeInTheDocument();
    act(() => container.setWidth(600 + COMPACT_LAYOUT_HYSTERESIS));
    expect(screen.getByText('tier 1')).toBeInTheDocument();
    act(() => container.setWidth(800 + COMPACT_LAYOUT_HYSTERESIS));
    expect(screen.getByText('tier 0')).toBeInTheDocument();
  });

  it('takes the narrowest layout at phone width', () => {
    layout = mockPhoneLayout();
    container = mockContainerWidth(900);
    render(<Probe />);
    expect(screen.getByText('tier 2')).toBeInTheDocument();
  });
});
