import { useMemo } from 'react';
import { makeStyles } from '@material-ui/core';
import classNames from 'classnames';
import { useInRouterContext } from 'react-router-dom';
import { createMarkdownLinkResolver } from '../../utils/resolveMarkdownLink';
import { InPageAnchors } from './InPageAnchors';
import { MarkdownRenderer } from './MarkdownRenderer';

type Dialect = 'gfm' | 'common-mark';

type GSMarkdownContentProps = {
  content: string;
  /** Markdown dialect passed through to the underlying renderer. Defaults to GFM. */
  dialect?: Dialect;
  /** URL the markdown was loaded from; relative links resolve against it. */
  sourceUrl?: string;
  className?: string;
};

const useStyles = makeStyles(theme => ({
  // The markdown renderer emits bare `<p>`/`<li>` tags without MUI Typography
  // classes, so they fall back to the document line-height and read
  // inconsistently — both next to surrounding MUI/bui text and against each
  // other (roomy paragraphs, dense list items). Normalise both to the body1
  // variant so every caller gets the same, correct rendering instead of
  // re-implementing this fix locally.
  root: {
    // A long URL, an inline-code token or a snake_case name breaks rather
    // than pushing the page sideways — at 343px on a phone, the common case.
    overflowWrap: 'anywhere',
    // A GFM table scrolls inside itself instead of widening the page (or,
    // collapsed in `CollapsibleMarkdown`, being cut off at the right edge).
    // `display: block` makes the table its own scroll container; its rows
    // still lay out as a table. The session timeline's `MessageMarkdown` is
    // the reference for both.
    '& table': {
      display: 'block',
      maxWidth: '100%',
      overflowX: 'auto',
    },
    // `overflow-wrap: anywhere` inherits and shrinks a cell's min-content
    // width, so a wide table would break words mid-word instead of scrolling.
    '& th, & td': {
      overflowWrap: 'normal',
    },
    '& img': {
      maxWidth: '100%',
    },
    // Not inside a diagram: Mermaid sizes its labels in its own font.
    '& p:not(svg p), & li:not(svg li)': {
      ...theme.typography.body1,
    },
    // Space consecutive list items apart so lists don't read as one dense block.
    '& li + li': {
      marginTop: theme.spacing(1),
    },
    '& p:first-child': {
      marginTop: 0,
    },
    '& p:last-child': {
      marginBottom: 0,
    },
    // Non-highlighted fenced blocks render as a bare `<pre><code>` with no
    // line-height or padding. Give them the readable body1 line-height and
    // block padding. Language-tagged blocks go through core-components'
    // CodeSnippet, whose wrapping `<pre>` holds a `<div>` (not a direct
    // `<code>`) and renders its own styled block — the `:has(> code)` scope
    // keeps us off it so it isn't double-boxed.
    '& pre:has(> code)': {
      lineHeight: theme.typography.body1.lineHeight,
      padding: theme.spacing(1.5),
      borderRadius: theme.shape.borderRadius,
      backgroundColor: theme.palette.action.hover,
      overflowX: 'auto',
    },
  },
}));

/**
 * Shared markdown renderer for Giant Swarm plugins.
 *
 * Renders as `@backstage/core-components`' `MarkdownContent` does, with a
 * consistent default (GFM) and the paragraph-typography fix every caller
 * otherwise had to add by hand. Use this for rendering user/authored markdown — README and SOUL
 * of catalog entities, plan documents, PR bodies and comments, etc.
 *
 * A `#heading` link jumps to its target within this document, matched the way
 * GitHub matches it, and moves focus there as the browser does for a fragment.
 * A ```mermaid block renders as its diagram, as on GitHub.
 */
export const GSMarkdownContent = ({
  content,
  dialect = 'gfm',
  sourceUrl,
  className,
}: GSMarkdownContentProps) => {
  const classes = useStyles();
  const transformLinkUri = useMemo(
    () => createMarkdownLinkResolver(sourceUrl),
    [sourceUrl],
  );
  // Without a router there are no links to jump from: they render through it.
  const inRouter = useInRouterContext();

  const rootClassName = classNames(classes.root, className);
  const markdown = (
    <MarkdownRenderer
      content={content}
      dialect={dialect}
      transformLinkUri={transformLinkUri}
    />
  );

  return inRouter ? (
    <InPageAnchors className={rootClassName}>{markdown}</InPageAnchors>
  ) : (
    <div className={rootClassName}>{markdown}</div>
  );
};
