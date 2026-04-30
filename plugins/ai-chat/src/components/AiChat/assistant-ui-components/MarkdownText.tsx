import { memo } from 'react';
import {
  MarkdownTextPrimitive,
  unstable_memoizeMarkdownComponents as memoizeMarkdownComponents,
} from '@assistant-ui/react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { makeStyles, createStyles, Theme } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import { Link as BackstageLink } from '@backstage/core-components';
import Table from '@material-ui/core/Table';
import TableBody from '@material-ui/core/TableBody';
import TableCell from '@material-ui/core/TableCell';
import TableHead from '@material-ui/core/TableHead';
import TableRow from '@material-ui/core/TableRow';
import { ExternalLink } from '@giantswarm/backstage-plugin-ui-react';
import { EntityRefLink } from '@backstage/plugin-catalog-react';
import classNames from 'classnames';
import { MermaidDiagram } from './MermaidDiagram';

export const useMarkdownStyles = makeStyles((theme: Theme) =>
  createStyles({
    '@keyframes fadeInUp': {
      from: { opacity: 0, transform: 'translateY(8px)' },
      to: { opacity: 1, transform: 'translateY(0)' },
    },
    codeBlock: {
      backgroundColor: 'var(--bui-bg-neutral-1)',
      padding: theme.spacing(2),
      borderRadius: 'var(--bui-radius-3)',
      overflowX: 'auto',
      margin: theme.spacing(2, 0),
      fontFamily: 'monospace',
      fontSize: '0.875rem',
    },
    codeBlockAnimate: {
      animation: '$fadeInUp 0.3s ease-out',
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
      position: 'relative',
    },
    table: {},
    tableAnimate: {
      animation: '$fadeInUp 0.3s ease-out',
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
      },
    },
    paragraph: {
      margin: theme.spacing(1, 0),
      lineHeight: 1.6,
    },
    heading: {
      marginTop: theme.spacing(2),
      marginBottom: theme.spacing(1),
    },
    heading1: {
      fontSize: '1.25rem',
      fontWeight: 700,
    },
    heading2: {
      fontSize: '1.125rem',
      fontWeight: 700,
    },
    heading3: {
      fontSize: '1rem',
      fontWeight: 700,
    },
    heading4: {
      fontSize: '1rem',
      fontWeight: 500,
    },
    heading5: {
      fontSize: '0.875rem',
      fontWeight: 500,
    },
    heading6: {
      fontSize: '0.875rem',
      fontWeight: 400,
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
    detailsAnimate: {
      animation: '$fadeInUp 0.3s ease-out',
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
  }),
);

export const createMarkdownComponents = (
  classes: ReturnType<typeof useMarkdownStyles>,
  options?: { animate?: boolean },
) =>
  memoizeMarkdownComponents({
    h1: ({ children }) => (
      <Typography
        variant="h4"
        className={classNames(classes.heading, classes.heading1)}
      >
        {children}
      </Typography>
    ),
    h2: ({ children }) => (
      <Typography
        variant="h5"
        className={classNames(classes.heading, classes.heading2)}
      >
        {children}
      </Typography>
    ),
    h3: ({ children }) => (
      <Typography
        variant="h6"
        className={classNames(classes.heading, classes.heading3)}
      >
        {children}
      </Typography>
    ),
    h4: ({ children }) => (
      <Typography
        variant="subtitle1"
        className={classNames(classes.heading, classes.heading4)}
      >
        {children}
      </Typography>
    ),
    h5: ({ children }) => (
      <Typography
        variant="subtitle2"
        className={classNames(classes.heading, classes.heading5)}
      >
        {children}
      </Typography>
    ),
    h6: ({ children }) => (
      <Typography
        variant="body2"
        className={classNames(classes.heading, classes.heading6)}
      >
        {children}
      </Typography>
    ),
    p: ({ children }) => (
      <Typography variant="body2" className={classes.paragraph}>
        {children}
      </Typography>
    ),
    a: ({ href, children }) => {
      if (!href) {
        return <>{children}</>;
      }

      let url: URL;
      try {
        url = new URL(href, window.location.origin);
      } catch {
        return <>{children}</>;
      }

      // External link: different origin
      if (url.origin !== window.location.origin) {
        return <ExternalLink href={href}>{children}</ExternalLink>;
      }

      // Catalog entity link: /catalog/:namespace/:kind/:name
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
          />
        );
      }

      // Other internal links: SPA navigation
      return (
        <BackstageLink
          to={url.pathname}
          target="_blank"
          rel="noopener noreferrer"
        >
          {children}
        </BackstageLink>
      );
    },
    blockquote: ({ children }) => (
      <blockquote className={classes.blockquote}>{children}</blockquote>
    ),
    ul: ({ children }) => <ul className={classes.list}>{children}</ul>,
    ol: ({ children }) => <ol className={classes.list}>{children}</ol>,
    li: ({ children }) => <li>{children}</li>,
    hr: () => <hr className={classes.hr} />,
    table: ({ children }) => (
      <div className={classes.tableContainer}>
        <Table
          className={classNames(
            classes.table,
            options?.animate && classes.tableAnimate,
          )}
        >
          {children}
        </Table>
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
    pre: ({ children }) => {
      return (
        <pre
          className={classNames(
            classes.codeBlock,
            options?.animate && classes.codeBlockAnimate,
          )}
        >
          {children}
        </pre>
      );
    },
    code: ({ children, className }) => {
      if (className && /\blanguage-mermaid\b/.test(className)) {
        return <MermaidDiagram source={String(children)} />;
      }
      const content = String(children);
      if (content.includes('\n')) {
        return <code>{children}</code>;
      }
      return <code className={classes.inlineCode}>{children}</code>;
    },
    details: ({ children }) => (
      <details
        className={classNames(
          classes.details,
          options?.animate && classes.detailsAnimate,
        )}
      >
        {children}
      </details>
    ),
    summary: ({ children }) => (
      <summary className={classes.summary}>{children}</summary>
    ),
  });

const MarkdownTextImpl = () => {
  const classes = useMarkdownStyles();
  const components = createMarkdownComponents(classes);

  return (
    <MarkdownTextPrimitive
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeRaw]}
      components={components}
    />
  );
};

export const MarkdownText = memo(MarkdownTextImpl);
