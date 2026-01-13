import { memo } from 'react';
import {
  MarkdownTextPrimitive,
  unstable_memoizeMarkdownComponents as memoizeMarkdownComponents,
} from '@assistant-ui/react-markdown';
import remarkGfm from 'remark-gfm';
import { makeStyles, createStyles, Theme } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import Link from '@material-ui/core/Link';
import Table from '@material-ui/core/Table';
import TableBody from '@material-ui/core/TableBody';
import TableCell from '@material-ui/core/TableCell';
import TableHead from '@material-ui/core/TableHead';
import TableRow from '@material-ui/core/TableRow';

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    codeBlock: {
      backgroundColor: theme.palette.type === 'dark' ? '#1e1e1e' : '#f5f5f5',
      padding: theme.spacing(2),
      borderRadius: theme.shape.borderRadius,
      overflowX: 'auto',
      margin: theme.spacing(2, 0),
      fontFamily: 'monospace',
      fontSize: '0.875rem',
    },
    inlineCode: {
      backgroundColor: theme.palette.type === 'dark' ? '#333' : '#eee',
      padding: theme.spacing(0.25, 0.5),
      borderRadius: theme.shape.borderRadius / 2,
      fontFamily: 'monospace',
      fontSize: '0.875rem',
    },
    blockquote: {
      borderLeft: `4px solid ${theme.palette.divider}`,
      paddingLeft: theme.spacing(2),
      margin: theme.spacing(2, 0),
      fontStyle: 'italic',
      color: theme.palette.text.secondary,
    },
    table: {
      margin: theme.spacing(2, 0),
    },
    tableCell: {
      borderBottom: `1px solid ${theme.palette.divider}`,
    },
    list: {
      marginLeft: theme.spacing(2),
      marginTop: theme.spacing(1),
      marginBottom: theme.spacing(1),
    },
    paragraph: {
      margin: theme.spacing(1, 0),
      lineHeight: 1.6,
    },
    heading: {
      marginTop: theme.spacing(2),
      marginBottom: theme.spacing(1),
    },
    hr: {
      border: 'none',
      borderTop: `1px solid ${theme.palette.divider}`,
      margin: theme.spacing(2, 0),
    },
  }),
);

const createMarkdownComponents = (classes: ReturnType<typeof useStyles>) =>
  memoizeMarkdownComponents({
    h1: ({ children }) => (
      <Typography variant="h4" className={classes.heading}>
        {children}
      </Typography>
    ),
    h2: ({ children }) => (
      <Typography variant="h5" className={classes.heading}>
        {children}
      </Typography>
    ),
    h3: ({ children }) => (
      <Typography variant="h6" className={classes.heading}>
        {children}
      </Typography>
    ),
    h4: ({ children }) => (
      <Typography variant="subtitle1" className={classes.heading}>
        {children}
      </Typography>
    ),
    h5: ({ children }) => (
      <Typography variant="subtitle2" className={classes.heading}>
        {children}
      </Typography>
    ),
    h6: ({ children }) => (
      <Typography variant="body2" className={classes.heading}>
        {children}
      </Typography>
    ),
    p: ({ children }) => (
      <Typography variant="body2" className={classes.paragraph}>
        {children}
      </Typography>
    ),
    a: ({ href, children }) => (
      <Link href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </Link>
    ),
    blockquote: ({ children }) => (
      <blockquote className={classes.blockquote}>{children}</blockquote>
    ),
    ul: ({ children }) => <ul className={classes.list}>{children}</ul>,
    ol: ({ children }) => <ol className={classes.list}>{children}</ol>,
    li: ({ children }) => <li>{children}</li>,
    hr: () => <hr className={classes.hr} />,
    table: ({ children }) => (
      <Table size="small" className={classes.table}>
        {children}
      </Table>
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
    code: ({ children }) => {
      // Check if it's inline code (no newlines) or code block
      const content = String(children);
      if (content.includes('\n')) {
        return <code>{children}</code>;
      }
      return <code className={classes.inlineCode}>{children}</code>;
    },
  });

const MarkdownTextImpl = () => {
  const classes = useStyles();
  const components = createMarkdownComponents(classes);

  return (
    <MarkdownTextPrimitive
      remarkPlugins={[remarkGfm]}
      components={components}
    />
  );
};

export const MarkdownText = memo(MarkdownTextImpl);
