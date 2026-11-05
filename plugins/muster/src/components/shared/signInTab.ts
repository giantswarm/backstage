/**
 * How long the tab a Sign in click opens waits for muster's sign-in URL.
 * muster's `core_auth_login` can take a while to answer: the backend may have
 * to open a new MCP session to muster first, and muster may have to discover
 * the connector's authorization server and register with it. Past this the
 * blank tab is closed and the URL is offered as a link in the portal instead,
 * once it arrives.
 */
export const DEFAULT_SIGN_IN_TAB_WAIT_MS = 10_000;

/** How often the waiting tab is checked for having been closed. */
const TAB_CLOSED_CHECK_MS = 250;

/** What the waiting tab says, in place of a bare about:blank. */
export const SIGN_IN_TAB_PLACEHOLDER = 'Opening the sign-in page…';

/**
 * The tab one Sign in click opened, until muster's answer says what to show
 * in it. Each click gets its own, carried with the request it started, so an
 * answer can only ever navigate the tab of its own click.
 */
export interface SignInTab {
  /**
   * Stops waiting and hands over the tab for muster's sign-in page, or `null`
   * when there is none to navigate: popups were blocked, the person closed
   * it, or it was closed for outlasting the wait.
   */
  take(): Window | null;
  /** Stops waiting and closes the tab, when muster has no page for it. */
  close(): void;
}

/** No tab: popups were blocked, or none was opened yet. */
export const NO_SIGN_IN_TAB: SignInTab = {
  take: () => null,
  close: () => {},
};

/**
 * Opens the sign-in tab. Call it synchronously in the click handler: a
 * window opened later, outside the user gesture, is what popup blockers
 * block. The tab shows {@link SIGN_IN_TAB_PLACEHOLDER} until it is taken.
 *
 * Once the tab is gone before muster answered, `onGiveUp` is called: either
 * the person closed it, or it outlasted `waitMs` and was closed here, since
 * a blank tab left open reads as a broken sign-in. The caller then offers the
 * sign-in in the portal, where the URL becomes a link once it arrives.
 */
export function openSignInTab(options: {
  waitMs: number;
  onGiveUp: () => void;
}): SignInTab {
  const opened = window.open('', '_blank') ?? null;
  if (!opened) {
    return NO_SIGN_IN_TAB;
  }
  // Same hygiene as a rel="noopener" link: the sign-in page never needs a
  // handle back to the portal.
  opened.opener = null;
  showPlaceholder(opened);

  let tab: Window | null = opened;
  const timers: {
    deadline?: ReturnType<typeof setTimeout>;
    check?: ReturnType<typeof setInterval>;
  } = {};
  const stop = () => {
    clearTimeout(timers.deadline);
    clearInterval(timers.check);
  };
  const giveUp = () => {
    stop();
    if (!tab) {
      return;
    }
    if (!tab.closed) {
      tab.close();
    }
    tab = null;
    options.onGiveUp();
  };
  timers.deadline = setTimeout(giveUp, options.waitMs);
  timers.check = setInterval(() => {
    if (tab?.closed) {
      giveUp();
    }
  }, TAB_CLOSED_CHECK_MS);

  return {
    take: () => {
      stop();
      const taken = tab && !tab.closed ? tab : null;
      tab = null;
      return taken;
    },
    close: () => {
      stop();
      tab?.close();
      tab = null;
    },
  };
}

/**
 * Says in the tab what it is waiting for. The tab's about:blank is the
 * portal's own origin, so it can be written to; a browser that will not let
 * it be leaves the tab blank, which is no worse.
 */
function showPlaceholder(tab: Window) {
  try {
    tab.document.title = SIGN_IN_TAB_PLACEHOLDER;
    if (tab.document.body) {
      tab.document.body.textContent = SIGN_IN_TAB_PLACEHOLDER;
    }
  } catch {
    // Not writable: left blank.
  }
}
