import { Helmet } from 'react-helmet';
import type { BreadcrumbItem } from '../Breadcrumbs';

/** What every agent-platform shell page's document title ends with. */
export const SHELL_DOCUMENT_TITLE_SUFFIX = 'Agent Platform';

const SEPARATOR = ' · ';

/**
 * A shell page's document title: its parts, most specific first, then the
 * product — "Lab Helper · Agents · Agent Platform". Empty parts are dropped,
 * and so is a part repeating the one before it, or the suffix.
 */
export function shellDocumentTitle(parts: ReadonlyArray<string | undefined>) {
  const kept: string[] = [];
  for (const part of parts) {
    const trimmed = part?.trim();
    if (
      trimmed &&
      trimmed !== SHELL_DOCUMENT_TITLE_SUFFIX &&
      trimmed !== kept[kept.length - 1]
    ) {
      kept.push(trimmed);
    }
  }
  return [...kept, SHELL_DOCUMENT_TITLE_SUFFIX].join(SEPARATOR);
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
 * sharpened by its content.
 */
export function ShellDocumentTitle({
  title,
}: {
  /** The page's parts, most specific first, e.g. `['Lab Helper', 'Agents']`. */
  title: string | ReadonlyArray<string | undefined>;
}) {
  const parts = typeof title === 'string' ? [title] : title;
  return <Helmet title={shellDocumentTitle(parts)} titleTemplate="%s" />;
}
