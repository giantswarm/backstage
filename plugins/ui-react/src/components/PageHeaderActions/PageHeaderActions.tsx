import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
} from 'react';

// A slot that lets routed page content contribute action buttons to the
// surrounding page header (the bui PluginHeader rendered by the app's
// PageLayout). This is how a tabbed section — where the single header is owned
// by the page layout, not by the tab content — can still show context-specific
// actions (e.g. a create form's Cancel / Review buttons) without the content
// rendering a second header of its own.
//
// Two contexts on purpose: content only ever consumes the (stable) setter, so
// registering actions never re-renders the content — only the header slot,
// which reads the value context, re-renders. That keeps the register-on-render
// effect below loop-free.
const PageHeaderActionsValueContext = createContext<ReactNode>(null);
const PageHeaderActionsSetContext = createContext<(actions: ReactNode) => void>(
  () => {},
);

// Whether routed content renders its own page header (its h1 and this slot),
// so a header the surrounding layout would draw has to stand aside. Split the
// same way: frames only consume the stable claim function.
const PageHeaderOwnedContext = createContext(false);
const PageHeaderClaimContext = createContext<() => () => void>(() => () => {});

export function PageHeaderActionsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [actions, setActions] = useState<ReactNode>(null);
  const [owners, setOwners] = useState(0);
  const claim = useCallback(() => {
    setOwners(count => count + 1);
    return () => setOwners(count => count - 1);
  }, []);
  return (
    <PageHeaderActionsSetContext.Provider value={setActions}>
      <PageHeaderClaimContext.Provider value={claim}>
        <PageHeaderOwnedContext.Provider value={owners > 0}>
          <PageHeaderActionsValueContext.Provider value={actions}>
            {children}
          </PageHeaderActionsValueContext.Provider>
        </PageHeaderOwnedContext.Provider>
      </PageHeaderClaimContext.Provider>
    </PageHeaderActionsSetContext.Provider>
  );
}

// Read the currently-registered header actions. Used by the page layout to
// render them in the header. Returns null when no content has registered any.
export function usePageHeaderActionsSlot(): ReactNode {
  return useContext(PageHeaderActionsValueContext);
}

// Register header actions from routed content for as long as the calling
// component is mounted; they are cleared automatically on unmount. The effect
// re-runs only when the `actions` element identity changes, so callers should
// pass a memoized element (e.g. via `useMemo`) — otherwise a new element every
// render would re-push (and re-render the header) on every render. The setter is
// stable, so registering never re-renders the caller.
export function useProvidePageHeaderActions(actions: ReactNode): void {
  const setActions = useContext(PageHeaderActionsSetContext);
  useEffect(() => {
    setActions(actions);
    return () => setActions(null);
  }, [actions, setActions]);
}

// Declare, for as long as the calling frame is mounted, that routed content
// renders the page header itself: its own h1 and the actions slot. A layout
// that would otherwise draw a header reads `usePageHeaderOwned()` and draws
// none, so the page has one h1 and each action once. Claimed in a layout
// effect, so the layout's header is gone before the first paint.
export function useOwnPageHeader(): void {
  const claim = useContext(PageHeaderClaimContext);
  useLayoutEffect(() => claim(), [claim]);
}

// Whether routed content below the provider renders its own page header.
export function usePageHeaderOwned(): boolean {
  return useContext(PageHeaderOwnedContext);
}
