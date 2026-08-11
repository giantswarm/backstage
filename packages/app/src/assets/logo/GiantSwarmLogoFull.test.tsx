import { render } from '@testing-library/react';
import { GiantSwarmLogoFull } from './GiantSwarmLogoFull';
import { GiantSwarmMark } from './GiantSwarmMark';

/**
 * The sidebar and the home page can both mount the lockup, so the ant's
 * gradient id has to be unique per instance — a shared id makes every copy
 * resolve `fill="url(#...)"` against whichever gradient is first in the DOM.
 */
describe('GiantSwarmLogoFull', () => {
  const gradientIdsOf = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('linearGradient')).map(el => el.id);

  it('points the ant fill at a gradient defined in the same SVG', () => {
    const { container } = render(<GiantSwarmLogoFull />);

    const [gradientId] = gradientIdsOf(container);
    expect(gradientId).toBeTruthy();

    const filled = container.querySelector(`[fill="url(#${gradientId})"]`);
    expect(filled).not.toBeNull();
  });

  it('gives each instance its own gradient id', () => {
    const { container } = render(
      <>
        <GiantSwarmLogoFull />
        <GiantSwarmLogoFull />
      </>,
    );

    const ids = gradientIdsOf(container);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });

  it('uses an id that needs no escaping when looked up by selector', () => {
    const { container } = render(<GiantSwarmLogoFull />);

    const [gradientId] = gradientIdsOf(container);
    expect(gradientId).toMatch(/^[A-Za-z][\w-]*$/);
  });

  /**
   * The collapsed rail and the expanded sidebar sit in the same place, so the
   * mark has to carry the same brand colors as the lockup's ant rather than
   * inheriting the surrounding text color.
   */
  it('renders the same colored ant as the standalone mark', () => {
    const { container } = render(
      <>
        <GiantSwarmLogoFull />
        <GiantSwarmMark />
      </>,
    );

    const [lockup, mark] = Array.from(container.querySelectorAll('svg'));

    for (const svg of [lockup, mark]) {
      const stops = Array.from(svg.querySelectorAll('stop')).map(s =>
        s.getAttribute('stop-color'),
      );
      expect(stops).toEqual(['#E14760', '#FA8816']);
    }

    // Still one gradient id per instance, across both components.
    const ids = gradientIdsOf(container);
    expect(new Set(ids).size).toBe(2);
  });

  /**
   * Both forms render at a fixed height, so an identical y origin and height in
   * the viewBox is what keeps the ant on the same pixels when the sidebar
   * expands and the mark is swapped for the lockup.
   */
  it('frames the mark and the lockup identically so the ant does not shift', () => {
    const boxOf = (el: HTMLElement) =>
      el.querySelector('svg')!.getAttribute('viewBox')!.split(' ').map(Number);

    const [, lockupY, , lockupHeight] = boxOf(
      render(<GiantSwarmLogoFull />).container,
    );
    const [, markY, , markHeight] = boxOf(render(<GiantSwarmMark />).container);

    expect(markY).toBe(lockupY);
    expect(markHeight).toBe(lockupHeight);
  });
});
