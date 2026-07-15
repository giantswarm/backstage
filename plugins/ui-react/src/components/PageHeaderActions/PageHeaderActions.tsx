import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
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

export function PageHeaderActionsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [actions, setActions] = useState<ReactNode>(null);
  return (
    <PageHeaderActionsSetContext.Provider value={setActions}>
      <PageHeaderActionsValueContext.Provider value={actions}>
        {children}
      </PageHeaderActionsValueContext.Provider>
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
