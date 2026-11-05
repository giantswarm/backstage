import { useEffect, useState } from 'react';

export type PageAttention = {
  /** The tab is not hidden: in front in its window, which is not minimised. */
  visible: boolean;
  /**
   * The page has the keyboard focus: its window is the one the person works
   * in. A visible window behind another application is visible, not focused.
   */
  focused: boolean;
};

function read(): PageAttention {
  if (typeof document === 'undefined') {
    return { visible: true, focused: true };
  }
  return { visible: !document.hidden, focused: document.hasFocus() };
}

/**
 * Whether the person can see the page, and whether they are working in it,
 * kept current as the tab is hidden or shown and its window gains or loses
 * focus.
 */
export function usePageAttention(): PageAttention {
  const [attention, setAttention] = useState(read);
  useEffect(() => {
    const update = () =>
      setAttention(current => {
        const next = read();
        return current.visible === next.visible &&
          current.focused === next.focused
          ? current
          : next;
      });
    document.addEventListener('visibilitychange', update);
    window.addEventListener('focus', update);
    window.addEventListener('blur', update);
    update();
    return () => {
      document.removeEventListener('visibilitychange', update);
      window.removeEventListener('focus', update);
      window.removeEventListener('blur', update);
    };
  }, []);
  return attention;
}
