import { MouseEvent, ReactNode, useRef } from 'react';
import { useHref } from 'react-router-dom';
import { findAnchorTarget, getInPageFragment } from './helpers';

/**
 * A `div` whose `#heading` links inside jump to their target. Markdown links
 * render through the router, which changes the hash without scrolling, so the
 * jump is done here instead.
 */
export const InPageAnchors = ({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const pageHref = useHref('#');

  const jumpToAnchor = (event: MouseEvent<HTMLDivElement>) => {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    const root = rootRef.current;
    const link = (event.target as Element).closest('a');
    const fragment =
      root && link && root.contains(link)
        ? getInPageFragment(link, pageHref)
        : undefined;
    if (!root || fragment === undefined) {
      return;
    }
    // Enough to keep the router from navigating; the link still reports its
    // click.
    event.preventDefault();

    const target = findAnchorTarget(root, fragment);
    if (target === 'top') {
      root.scrollIntoView({ block: 'start' });
      return;
    }
    if (!target) {
      return;
    }
    if (!target.hasAttribute('tabindex')) {
      target.tabIndex = -1;
    }
    // Focusing the element that already has focus fires no focus event, and
    // a container that expands on focus would stay collapsed.
    if (document.activeElement === target) {
      target.blur();
    }
    target.focus({ preventScroll: true });
    // A frame later, so a container that expands on focus has laid out.
    requestAnimationFrame(() => target.scrollIntoView({ block: 'start' }));
  };

  return (
    <div ref={rootRef} className={className} onClickCapture={jumpToAnchor}>
      {children}
    </div>
  );
};
