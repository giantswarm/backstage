import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from 'react';
import { Helmet } from 'react-helmet';
import type { BreadcrumbItem } from '../Breadcrumbs';

const SEPARATOR = ' · ';

const SuffixContext = createContext<string | undefined>(undefined);
const CountContext = createContext(0);
const SetCountContext = createContext<((count: number) => void) | undefined>(
  undefined,
);

/**
 * Names the product every shell page's document title ends with, e.g.
 * "Agent Platform". The app mounts it around the shell's pages; without one,
 * titles carry no suffix.
 *
 * It also holds the count a title is prefixed with ("(2) Sessions · Agent
 * Platform"), which one component below it sets with
 * {@link useShellDocumentTitleCount}: the shell's Notification inbox, for its
 * unread rows.
 */
export function ShellDocumentTitleProvider({
  suffix,
  children,
}: {
  suffix: string;
  children?: ReactNode;
}) {
  const [count, setCount] = useState(0);
  return (
    <SuffixContext.Provider value={suffix}>
      <SetCountContext.Provider value={setCount}>
        <CountContext.Provider value={count}>{children}</CountContext.Provider>
      </SetCountContext.Provider>
    </SuffixContext.Provider>
  );
}

/**
 * Prefixes every shell page's document title with `count` while it is above
 * zero and the caller is mounted. One caller per shell: the Notification
 * inbox, for its unread count. Does nothing without a
 * {@link ShellDocumentTitleProvider}.
 */
export function useShellDocumentTitleCount(count: number) {
  const setCount = useContext(SetCountContext);
  useEffect(() => {
    setCount?.(count);
  }, [setCount, count]);
  useEffect(() => () => setCount?.(0), [setCount]);
}

/**
 * A shell page's document title: its parts, most specific first, then the
 * suffix — "Lab Helper · Agents · Agent Platform". Empty parts are dropped,
 * and so is a part repeating the one before it, or the suffix. A `count` above
 * zero leads: "(2) Lab Helper · Agents · Agent Platform".
 */
export function shellDocumentTitle(
  parts: ReadonlyArray<string | undefined>,
  suffix?: string,
  count = 0,
) {
  const kept: string[] = [];
  for (const part of parts) {
    const trimmed = part?.trim();
    if (trimmed && trimmed !== suffix && trimmed !== kept[kept.length - 1]) {
      kept.push(trimmed);
    }
  }
  const title = (suffix ? [...kept, suffix] : kept).join(SEPARATOR);
  return title && count > 0 ? `(${count}) ${title}` : title;
}

/**
 * The parts a page frame's own header implies: the current breadcrumb (the
 * last), else the title when that is text, then the breadcrumb above it —
 * "Tools · Lab Helper", "jira · Connectors". Undefined when neither names the
 * page.
 */
export function shellTitleParts(
  title: unknown,
  breadcrumbs?: ReadonlyArray<BreadcrumbItem>,
): string[] | undefined {
  const crumbs = breadcrumbs ?? [];
  const current =
    crumbs[crumbs.length - 1]?.label ||
    (typeof title === 'string' ? title : undefined);
  if (!current) {
    return undefined;
  }
  const section = crumbs.length >= 2 ? crumbs[crumbs.length - 2].label : '';
  return [current, section];
}

/**
 * Sets the document title of a shell page (see {@link shellDocumentTitle}).
 *
 * The title is whole: it also sets the template to `%s`, so a template from
 * an outer page layout ("%s | <app title>") cannot append the product a
 * second time. The innermost one mounted wins, so a page frame's title can be
 * sharpened by its content. An empty title sets nothing.
 */
export function ShellDocumentTitle({
  title,
}: {
  /** The page's parts, most specific first, e.g. `['Lab Helper', 'Agents']`. */
  title: string | ReadonlyArray<string | undefined>;
}) {
  const suffix = useContext(SuffixContext);
  const count = useContext(CountContext);
  const parts = typeof title === 'string' ? [title] : title;
  const documentTitle = shellDocumentTitle(parts, suffix, count);
  // Nothing to name yet (a session's name still loading, no suffix): leave
  // the title to the layout rather than blanking it.
  if (!documentTitle) {
    return null;
  }
  return <Helmet title={documentTitle} titleTemplate="%s" />;
}
