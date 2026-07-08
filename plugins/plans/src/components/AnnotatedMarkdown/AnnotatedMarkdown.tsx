import { ElementType, ReactNode, useMemo, useState } from 'react';
import { Box, IconButton, makeStyles, Theme } from '@material-ui/core';
import AddCommentIcon from '@material-ui/icons/AddComment';
import ReactMarkdown, { Components, ExtraProps } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Element } from 'hast';
import { NewReviewComment, PlanPullFile, PlanReviewComment } from '../../apis';
import {
  CommentableLines,
  ReviewThread,
  commentableLines,
  firstCommentableLine,
  frontmatterOffset,
  groupThreads,
  threadsForBlock,
} from '../../lib/annotations';
import { splitFrontmatter } from '../../lib/files';
import { CommentForm, CommentThread } from '../Comments';

const GUTTER = 34;

const useStyles = makeStyles((theme: Theme) => ({
  root: {
    // Room for the margin gutter even when the parent has no padding.
    paddingLeft: GUTTER,
    fontSize: 15,
    lineHeight: 1.65,
    wordBreak: 'break-word',
    '& img': {
      maxWidth: '100%',
    },
    '& a': {
      color: theme.palette.primary.main,
    },
    '& h1, & h2, & h3, & h4, & h5, & h6': {
      lineHeight: 1.25,
      marginTop: theme.spacing(3),
      marginBottom: theme.spacing(1),
    },
    '& h1': { fontSize: '1.9em' },
    '& h2': { fontSize: '1.5em' },
    '& h3': { fontSize: '1.25em' },
    '& code': {
      fontFamily: 'monospace',
      fontSize: '0.875em',
      backgroundColor: theme.palette.action.hover,
      borderRadius: theme.shape.borderRadius,
      padding: '0.1em 0.35em',
    },
    '& pre': {
      overflowX: 'auto',
      backgroundColor: theme.palette.action.hover,
      border: `1px solid ${theme.palette.divider}`,
      borderRadius: theme.shape.borderRadius,
      padding: theme.spacing(1.5),
      '& code': {
        backgroundColor: 'transparent',
        padding: 0,
      },
    },
    '& table': {
      borderCollapse: 'collapse',
      display: 'block',
      overflowX: 'auto',
      '& th, & td': {
        border: `1px solid ${theme.palette.divider}`,
        padding: theme.spacing(0.5, 1),
      },
      '& th': {
        backgroundColor: theme.palette.action.hover,
      },
    },
    '& blockquote': {
      margin: theme.spacing(1, 0),
      padding: theme.spacing(0, 2),
      borderLeft: `3px solid ${theme.palette.divider}`,
      color: theme.palette.text.secondary,
    },
  },
  frontmatter: {
    fontFamily: 'monospace',
    fontSize: 12,
    whiteSpace: 'pre-wrap',
    color: theme.palette.text.secondary,
    backgroundColor: theme.palette.action.hover,
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius,
    padding: theme.spacing(1, 1.5),
    marginBottom: theme.spacing(2),
  },
  block: {
    position: 'relative',
    '&:hover > $addButton': {
      opacity: 1,
    },
  },
  addButton: {
    position: 'absolute',
    left: -GUTTER,
    top: 0,
    padding: 4,
    // Revealed on block hover; always present so keyboard focus reaches it.
    opacity: 0,
    '&:focus-visible': {
      opacity: 1,
    },
  },
  threads: {
    margin: theme.spacing(1, 0, 2),
  },
  thread: {
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius,
    padding: theme.spacing(1, 2),
    marginBottom: theme.spacing(1),
    backgroundColor: theme.palette.background.paper,
  },
}));

/** Block elements that carry a margin gutter and can anchor threads. */
const BLOCK_TAGS = new Set([
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'li',
  'pre',
  'table',
  'blockquote',
]);

function blockRange(
  node: Element | undefined,
): { start: number; end: number } | undefined {
  const start = node?.position?.start.line;
  const end = node?.position?.end.line;
  return start === undefined || end === undefined ? undefined : { start, end };
}

/**
 * True when a descendant block element contains the given source line. A
 * line owned by a nested block (paragraph in a blockquote, item in a nested
 * list) gets its gutter button and threads there, not on the ancestor --
 * otherwise every thread would render once per nesting level.
 */
function coveredByChildBlock(node: Element, line: number): boolean {
  for (const child of node.children) {
    if (child.type !== 'element') {
      continue;
    }
    const range = blockRange(child);
    if (range && (range.start > line || range.end < line)) {
      continue;
    }
    if (BLOCK_TAGS.has(child.tagName)) {
      return true;
    }
    if (coveredByChildBlock(child, line)) {
      return true;
    }
  }
  return false;
}

interface BlockContext {
  classes: ReturnType<typeof useStyles>;
  path: string;
  /** Source lines `splitFrontmatter` stripped; body line + offset = file line. */
  offset: number;
  commentable: CommentableLines;
  threads: ReviewThread[];
  commentingLine: number | undefined;
  setCommentingLine: (line: number | undefined) => void;
  onCreate: (comment: NewReviewComment) => Promise<unknown>;
}

type BlockProps = ExtraProps & { children?: ReactNode; className?: string };

/**
 * Wrap one markdown block element with a hover `+` gutter button and its
 * inline review threads. `li` keeps its own tag (an extra wrapper would be
 * invalid inside `ul`/`ol`); everything else gets a positioning `<div>`.
 */
function renderBlock(Tag: ElementType, ctx: BlockContext) {
  return function AnnotatedBlock({
    node,
    children,
    className,
    ...rest
  }: BlockProps) {
    const { classes, path, offset, commentable, threads, onCreate } = ctx;

    const range = blockRange(node);
    if (!range || !node) {
      return (
        <Tag {...rest} className={className}>
          {children}
        </Tag>
      );
    }

    const start = range.start + offset;
    const end = range.end + offset;
    const anchor = firstCommentableLine(commentable, start, end);
    const anchorOwned =
      anchor !== undefined && !coveredByChildBlock(node, anchor - offset);
    const blockThreads = threadsForBlock(threads, start, end).filter(
      ({ root }) =>
        root.line !== undefined &&
        !coveredByChildBlock(node, root.line - offset),
    );
    const composing = anchorOwned && ctx.commentingLine === anchor;

    const button = anchorOwned && (
      <IconButton
        className={classes.addButton}
        size="small"
        aria-label={`Comment on line ${anchor}`}
        onClick={() => ctx.setCommentingLine(anchor)}
      >
        <AddCommentIcon fontSize="inherit" />
      </IconButton>
    );

    const annotations = (blockThreads.length > 0 || composing) && (
      <Box className={classes.threads}>
        {blockThreads.map(thread => (
          <Box key={thread.root.id} className={classes.thread}>
            <CommentThread thread={thread} onCreate={onCreate} />
          </Box>
        ))}
        {composing && (
          <Box className={classes.thread}>
            <CommentForm
              placeholder={`Comment on line ${anchor}`}
              onSubmit={async body => {
                await onCreate({ body, path, line: anchor });
                ctx.setCommentingLine(undefined);
              }}
              onCancel={() => ctx.setCommentingLine(undefined)}
            />
          </Box>
        )}
      </Box>
    );

    if (Tag === 'li') {
      return (
        <li
          {...rest}
          className={[className, classes.block].filter(Boolean).join(' ')}
        >
          {button}
          {children}
          {annotations}
        </li>
      );
    }
    return (
      <div className={classes.block}>
        {button}
        <Tag {...rest} className={className}>
          {children}
        </Tag>
        {annotations}
      </div>
    );
  };
}

/**
 * Rendered markdown document with paragraph-level review commenting. Each
 * block whose source lines are part of the diff shows a `+` in the left
 * margin; existing review threads render in place under their anchor block.
 * Comments stay ordinary GitHub review comments -- the anchor line is
 * derived from react-markdown's source positions plus the frontmatter
 * offset.
 */
export function AnnotatedMarkdown(props: {
  /** Full file content at the PR head, including frontmatter. */
  content: string;
  file: PlanPullFile;
  /** Review comments; entries for other paths are ignored. */
  comments: PlanReviewComment[];
  onCreate: (comment: NewReviewComment) => Promise<unknown>;
}) {
  const { content, file, comments, onCreate } = props;
  const classes = useStyles();
  const [commentingLine, setCommentingLine] = useState<number | undefined>(
    undefined,
  );

  const { frontmatter, body } = splitFrontmatter(content);
  const offset = frontmatterOffset(content);
  const commentable = useMemo(() => commentableLines(file), [file]);
  const threads = useMemo(
    () => groupThreads(comments.filter(({ path }) => path === file.filename)),
    [comments, file.filename],
  );

  const components = useMemo(() => {
    const ctx: BlockContext = {
      classes,
      path: file.filename,
      offset,
      commentable,
      threads,
      commentingLine,
      setCommentingLine,
      onCreate,
    };
    const map: Record<string, unknown> = {};
    for (const tag of BLOCK_TAGS) {
      map[tag] = renderBlock(tag as ElementType, ctx);
    }
    return map as Components;
  }, [
    classes,
    file.filename,
    offset,
    commentable,
    threads,
    commentingLine,
    onCreate,
  ]);

  return (
    <Box className={classes.root}>
      {frontmatter && <Box className={classes.frontmatter}>{frontmatter}</Box>}
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {body}
      </ReactMarkdown>
    </Box>
  );
}
