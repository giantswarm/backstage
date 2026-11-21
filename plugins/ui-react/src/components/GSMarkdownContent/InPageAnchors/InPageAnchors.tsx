import { MouseEvent, ReactNode, useEffect, useRef } from 'react';
import { useHref, useLocation } from 'react-router-dom';
import { findAnchorTarget, getInPageFragment } from './helpers';

function scrollToAnchor(root: HTMLElement, fragment: string) {
  const target = findAnchorTarget(root, fragment);
  if (target === 'top') {
    root.scrollIntoView({ block: 'start' });
    return undefined;
  }
  if (!target) {
    return undefined;
  }
  if (!target.hasAttribute('tabindex')) {
    target.tabIndex = -1;
  }
  // A repeated focus must still notify containers that expand on focus.
  if (document.activeElement === target) {
    target.blur();
  }
  target.focus({ preventScroll: true });
  // Containers that expand on focus must lay out before scrolling.
  const frame = requestAnimationFrame(() =>
    target.scrollIntoView({ block: 'start' }),
  );
  return () => cancelAnimationFrame(frame);
}

/**
 * A `div` whose `#heading` links inside jump to their target. Markdown links
 * render through the router, which changes the hash without scrolling, so the
 * jump is done here instead.
 */
export const InPageAnchors = ({
  className,
  children,
  content,
  fragment,
}: {
  className: string;
  children: ReactNode;
  content: string;
  fragment?: string;
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const pageHref = useHref('#');
  const { key: locationKey } = useLocation();

  useEffect(() => {
    const root = rootRef.current;
    if (!root || fragment === undefined) return undefined;
    return scrollToAnchor(root, fragment);
  }, [content, fragment, locationKey]);

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
    const linkFragment =
      root && link && root.contains(link)
        ? getInPageFragment(link, pageHref)
        : undefined;
    if (!root || linkFragment === undefined) {
      return;
    }
    // Enough to keep the router from navigating; the link still reports its
    // click.
    event.preventDefault();

    scrollToAnchor(root, linkFragment);
  };

  return (
    <div ref={rootRef} className={className} onClickCapture={jumpToAnchor}>
      {children}
    </div>
  );
};
