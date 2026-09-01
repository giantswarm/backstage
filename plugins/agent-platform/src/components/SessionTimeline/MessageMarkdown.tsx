import { memo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { Link as BackstageLink } from '@backstage/core-components';
import { EntityRefLink } from '@backstage/plugin-catalog-react';
import {
  makeStyles,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@material-ui/core';
import { ExternalLink } from '@giantswarm/backstage-plugin-ui-react';

/**
 * Styling for agent prose, shared with the AI chat plugin's visual language so
 * both chat surfaces read the same: MUI tables, code blocks on a neutral
 * surface, inline code as chips, quiet blockquotes.
 */
const useStyles = makeStyles(theme => ({
  root: {
    // Trim the margins markdown adds at both ends, so a message aligns with its
    // neighbours instead of floating between its own first and last paragraphs.
    '& > :first-child': {
      marginTop: 0,
    },
    '& > :last-child': {
      marginBottom: 0,
    },
    overflowWrap: 'anywhere',
  },
  paragraph: {
    margin: theme.spacing(1, 0),
    lineHeight: 1.6,
  },
  heading: {
    marginTop: theme.spacing(2),
    marginBottom: theme.spacing(1),
  },
  heading1: { fontSize: '1.25rem', fontWeight: 700 },
  heading2: { fontSize: '1.125rem', fontWeight: 700 },
  heading3: { fontSize: '1rem', fontWeight: 700 },
  heading4: { fontSize: '1rem', fontWeight: 500 },
  heading5: { fontSize: '0.875rem', fontWeight: 500 },
  heading6: { fontSize: '0.875rem', fontWeight: 400 },
  codeBlock: {
    backgroundColor: 'var(--bui-bg-neutral-1)',
    padding: theme.spacing(2),
    borderRadius: 'var(--bui-radius-3)',
    overflowX: 'auto',
    margin: theme.spacing(2, 0),
    fontFamily: 'monospace',
    fontSize: '0.875rem',
    lineHeight: 1.5,
  },
  inlineCode: {
    backgroundColor: 'var(--bui-bg-neutral-2)',
    padding: theme.spacing(0, 0.5),
    margin: theme.spacing(0.25, 0),
    borderRadius: 'var(--bui-radius-1)',
    fontFamily: 'monospace',
    fontSize: '0.875rem',
    display: 'inline-block',
    maxWidth: '100%',
    overflowX: 'auto',
    verticalAlign: 'middle',
  },
  blockquote: {
    borderLeft: `4px solid ${theme.palette.divider}`,
    paddingLeft: theme.spacing(2),
    margin: theme.spacing(2, 0),
    fontStyle: 'italic',
    color: theme.palette.text.secondary,
  },
  tableContainer: {
    margin: theme.spacing(2, 0),
    overflowX: 'auto',
  },
  tableCell: {
    borderBottom: `1px solid ${theme.palette.divider}`,
    lineHeight: 1.6,
    wordBreak: 'initial',
    padding: theme.spacing(1, 1),
  },
  list: {
    marginLeft: theme.spacing(1),
    marginTop: theme.spacing(1),
    marginBottom: theme.spacing(1),
    paddingInlineStart: theme.spacing(3),
    '& > li': {
      marginTop: theme.spacing(0.5),
      marginBottom: theme.spacing(0.5),
      lineHeight: 1.6,
    },
  },
  hr: {
    border: 'none',
    borderTop: `1px solid ${theme.palette.divider}`,
    margin: theme.spacing(2, 0),
  },
  details: {
    backgroundColor: 'var(--bui-bg-neutral-1)',
    borderRadius: 'var(--bui-radius-3)',
    padding: theme.spacing(1, 2),
    margin: theme.spacing(2, 0),
    '&[open] > summary': {
      marginBottom: theme.spacing(1),
    },
  },
  summary: {
    cursor: 'pointer',
    fontWeight: 500,
    lineHeight: 1.6,
    outline: 'none',
    '&:focus-visible': {
      outline: `2px solid ${theme.palette.primary.main}`,
      outlineOffset: 2,
      borderRadius: 'var(--bui-radius-1)',
    },
  },
}));

/**
 * Where a link in agent prose should go.
 *
 * Same routing the AI chat makes: another origin opens externally with the
 * usual warning affordance, a catalog path becomes an entity link, and any
 * other same-origin path navigates within the app.
 */
function MarkdownLink({
  href,
  children,
}: {
  href?: string;
  children?: React.ReactNode;
}) {
  if (!href) {
    return <>{children}</>;
  }

  let url: URL;
  try {
    url = new URL(href, window.location.origin);
  } catch {
    return <>{children}</>;
  }

  if (url.origin !== window.location.origin) {
    return <ExternalLink href={href}>{children}</ExternalLink>;
  }

  const catalogMatch = url.pathname.match(
    /^\/catalog\/([^/]+)\/([^/]+)\/([^/]+)/,
  );
  if (catalogMatch) {
    const [, namespace, kind, name] = catalogMatch;
    return (
      <EntityRefLink
        entityRef={{ namespace, kind, name }}
        target="_blank"
        rel="noopener noreferrer"
      >
        {children}
      </EntityRefLink>
    );
  }

  return (
    <BackstageLink to={url.pathname} target="_blank" rel="noopener noreferrer">
      {children}
    </BackstageLink>
  );
}

function useMarkdownComponents(): Components {
  const classes = useStyles();
  return {
    h1: ({ children }) => (
      <Typography
        variant="h4"
        className={`${classes.heading} ${classes.heading1}`}
      >
        {children}
      </Typography>
    ),
    h2: ({ children }) => (
      <Typography
        variant="h5"
        className={`${classes.heading} ${classes.heading2}`}
      >
        {children}
      </Typography>
    ),
    h3: ({ children }) => (
      <Typography
        variant="h6"
        className={`${classes.heading} ${classes.heading3}`}
      >
        {children}
      </Typography>
    ),
    h4: ({ children }) => (
      <Typography
        variant="subtitle1"
        className={`${classes.heading} ${classes.heading4}`}
      >
        {children}
      </Typography>
    ),
    h5: ({ children }) => (
      <Typography
        variant="subtitle2"
        className={`${classes.heading} ${classes.heading5}`}
      >
        {children}
      </Typography>
    ),
    h6: ({ children }) => (
      <Typography
        variant="body2"
        className={`${classes.heading} ${classes.heading6}`}
      >
        {children}
      </Typography>
    ),
    p: ({ children }) => (
      <Typography variant="body2" className={classes.paragraph}>
        {children}
      </Typography>
    ),
    a: ({ href, children }) => (
      <MarkdownLink href={href}>{children}</MarkdownLink>
    ),
    blockquote: ({ children }) => (
      <blockquote className={classes.blockquote}>{children}</blockquote>
    ),
    ul: ({ children }) => <ul className={classes.list}>{children}</ul>,
    ol: ({ children }) => <ol className={classes.list}>{children}</ol>,
    hr: () => <hr className={classes.hr} />,
    table: ({ children }) => (
      <div className={classes.tableContainer}>
        <Table size="small">{children}</Table>
      </div>
    ),
    thead: ({ children }) => <TableHead>{children}</TableHead>,
    tbody: ({ children }) => <TableBody>{children}</TableBody>,
    tr: ({ children }) => <TableRow>{children}</TableRow>,
    th: ({ children }) => (
      <TableCell className={classes.tableCell} component="th">
        {children}
      </TableCell>
    ),
    td: ({ children }) => (
      <TableCell className={classes.tableCell}>{children}</TableCell>
    ),
    pre: ({ children }) => <pre className={classes.codeBlock}>{children}</pre>,
    code: ({ children, className }) => {
      const content = String(children);
      // A fenced block arrives as `pre > code`; the pre above carries the
      // styling. Only genuinely inline code gets the chip treatment.
      if (content.includes('\n')) {
        return <code className={className}>{children}</code>;
      }
      return <code className={classes.inlineCode}>{children}</code>;
    },
    details: ({ children }) => (
      <details className={classes.details}>{children}</details>
    ),
    summary: ({ children }) => (
      <summary className={classes.summary}>{children}</summary>
    ),
  };
}

/**
 * Agent prose. GFM (tables, task lists, strikethrough) plus raw HTML — agents
 * wrap long output in `<details>` blocks, which is the same trade the AI chat
 * plugin makes.
 */
function MessageMarkdownImpl({ text }: { text: string }) {
  const classes = useStyles();
  const components = useMarkdownComponents();
  return (
    <div className={classes.root}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={components}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

export const MessageMarkdown = memo(MessageMarkdownImpl);
