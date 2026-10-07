import { MouseEvent, ReactNode, useMemo, useRef } from 'react';
import { MarkdownContent } from '@backstage/core-components';
import { makeStyles } from '@material-ui/core';
import classNames from 'classnames';
import { useHref, useInRouterContext } from 'react-router-dom';
import { createMarkdownLinkResolver } from '../../utils/resolveMarkdownLink';
import { findAnchorTarget, getInPageFragment } from './helpers';

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
  // `MarkdownContent` emits bare `<p>`/`<li>` tags without MUI Typography
  // classes, so they fall back to the document line-height and read
  // inconsistently — both next to surrounding MUI/bui text and against each
  // other (roomy paragraphs, dense list items). Normalise both to the body1
  // variant so every caller gets the same, correct rendering instead of
  // re-implementing this fix locally.
  root: {
    '& p, & li': {
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
 * A `div` whose `#heading` links inside jump to their target. Markdown links
 * render through the router, which changes the hash without scrolling, so the
 * jump is done here instead.
 */
const InPageAnchors = ({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const pageHref = useHref('#');

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
    const link = (event.target as Element).closest('a');
    const fragment = link ? getInPageFragment(link, pageHref) : undefined;
    if (fragment === undefined || !rootRef.current) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();

    const target = findAnchorTarget(rootRef.current, fragment);
    if (target === 'top') {
      rootRef.current.scrollIntoView({ block: 'start' });
      return;
    }
    if (!target) {
      return;
    }
    if (!target.hasAttribute('tabindex')) {
      target.tabIndex = -1;
    }
    target.focus({ preventScroll: true });
    // A frame later, so a container that expands on focus has laid out.
    requestAnimationFrame(() => target.scrollIntoView({ block: 'start' }));
  };

  return (
    <div ref={rootRef} className={className} onClickCapture={jumpToAnchor}>
      {children}
    </div>
  );
};

/**
 * Shared markdown renderer for Giant Swarm plugins.
 *
 * Wraps `@backstage/core-components`' `MarkdownContent` with a consistent
 * default (GFM) and the paragraph-typography fix every caller otherwise had to
 * add by hand. Use this for rendering user/authored markdown — README and SOUL
 * of catalog entities, plan documents, PR bodies and comments, etc.
 *
 * A `#heading` link jumps to its target within this document, matched the way
 * GitHub matches it, and moves focus there as the browser does for a fragment.
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
    <MarkdownContent
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
