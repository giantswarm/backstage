import { useEffect, useLayoutEffect, useState } from 'react';

/**
 * The id of the agent shell's content region — the app's `ShellMain`
 * (`SHELL_CONTENT_ID`, the skip link's target), which sits beside the nav
 * rail and starts where the rail ends, whatever its width: collapsed,
 * expanded or resized. The app sets that edge (SidebarPage's padding plus the
 * region's own offset); here it is measured, not computed. muster cannot
 * import the app, so it is matched by this id, as the skip link and the
 * shell's stylesheet (`#content`) do.
 */
export const SHELL_CONTENT_ID = 'content';

function contentArea(): HTMLElement | null {
  return document.getElementById(SHELL_CONTENT_ID);
}

/**
 * Where the shell's content area starts on the left, in px — the rail's
 * width. Kept current while `active`: the rail collapsing, expanding or
 * being resized resizes the content area, as does the window. 0 without a shell content
 * area (and at phone width, where the rail is the bottom bar and the
 * content starts at the screen's edge).
 */
export function useContentAreaLeft(active: boolean): number {
  const [left, setLeft] = useState(0);
  useLayoutEffect(() => {
    if (!active) return undefined;
    const content = contentArea();
    if (!content) {
      setLeft(0);
      return undefined;
    }
    const measure = () =>
      setLeft(Math.max(0, Math.round(content.getBoundingClientRect().left)));
    measure();
    window.addEventListener('resize', measure);
    const observer =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver(measure);
    observer?.observe(content);
    return () => {
      window.removeEventListener('resize', measure);
      observer?.disconnect();
    };
  }, [active]);
  return left;
}

/**
 * Makes the page behind a layer that covers the content area unreachable —
 * `inert`, and no longer scrolling — while the nav rail beside it stays in
 * use. Without a shell content area (a page rendered outside the shell),
 * everything in `<body>` but the layer goes inert instead, as the
 * create-agent assist's covering panel does. Undone when the layer closes or
 * unmounts; elements that were inert already are left so.
 */
export function useInertBehind(layer: HTMLElement | null, active: boolean) {
  useEffect(() => {
    if (!active || !layer) {
      return undefined;
    }
    const content = contentArea();
    const behind = content
      ? [content]
      : Array.from(document.body.children).filter(element => element !== layer);
    const made = behind.filter(element => !element.hasAttribute('inert'));
    made.forEach(element => element.setAttribute('inert', ''));
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      made.forEach(element => element.removeAttribute('inert'));
      document.body.style.overflow = overflow;
    };
  }, [layer, active]);
}
