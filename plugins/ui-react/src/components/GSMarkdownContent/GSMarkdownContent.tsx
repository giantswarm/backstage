import { MarkdownContent } from '@backstage/core-components';
import { makeStyles } from '@material-ui/core';
import classNames from 'classnames';

type Dialect = 'gfm' | 'common-mark';

type GSMarkdownContentProps = {
  content: string;
  /** Markdown dialect passed through to the underlying renderer. Defaults to GFM. */
  dialect?: Dialect;
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
 * Shared markdown renderer for Giant Swarm plugins.
 *
 * Wraps `@backstage/core-components`' `MarkdownContent` with a consistent
 * default (GFM) and the paragraph-typography fix every caller otherwise had to
 * add by hand. Use this for rendering user/authored markdown — README and SOUL
 * of catalog entities, plan documents, PR bodies and comments, etc.
 */
export const GSMarkdownContent = ({
  content,
  dialect = 'gfm',
  className,
}: GSMarkdownContentProps) => {
  const classes = useStyles();

  return (
    <div className={classNames(classes.root, className)}>
      <MarkdownContent content={content} dialect={dialect} />
    </div>
  );
};
