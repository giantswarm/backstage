import { createContext, type ReactNode, useContext } from 'react';
import { Helmet } from 'react-helmet';
import type { BreadcrumbItem } from '../Breadcrumbs';

const SEPARATOR = ' · ';

const SuffixContext = createContext<string | undefined>(undefined);

/**
 * Names the product every shell page's document title ends with, e.g.
 * "Agent Platform". The app mounts it around the shell's pages; without one,
 * titles carry no suffix.
 */
export function ShellDocumentTitleProvider({
  suffix,
  children,
}: {
  suffix: string;
  children?: ReactNode;
}) {
  return (
    <SuffixContext.Provider value={suffix}>{children}</SuffixContext.Provider>
  );
}

/**
 * A shell page's document title: its parts, most specific first, then the
 * suffix — "Lab Helper · Agents · Agent Platform". Empty parts are dropped,
 * and so is a part repeating the one before it, or the suffix.
 */
export function shellDocumentTitle(
  parts: ReadonlyArray<string | undefined>,
  suffix?: string,
) {
  const kept: string[] = [];
  for (const part of parts) {
    const trimmed = part?.trim();
    if (trimmed && trimmed !== suffix && trimmed !== kept[kept.length - 1]) {
      kept.push(trimmed);
    }
  }
  return (suffix ? [...kept, suffix] : kept).join(SEPARATOR);
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
  const parts = typeof title === 'string' ? [title] : title;
  const documentTitle = shellDocumentTitle(parts, suffix);
  // Nothing to name yet (a session's name still loading, no suffix): leave
  // the title to the layout rather than blanking it.
  if (!documentTitle) {
    return null;
  }
  return <Helmet title={documentTitle} titleTemplate="%s" />;
}
