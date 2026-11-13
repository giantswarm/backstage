import { memo, useMemo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Link as BackstageLink } from '@backstage/core-components';
import { EntityRefLink } from '@backstage/plugin-catalog-react';
import { makeStyles } from '@material-ui/core';
import { Text } from '@backstage/ui';
import { ExternalLink } from '@giantswarm/backstage-plugin-ui-react';
import { STABLE_CLASS_NAMES } from '../../lib/stableClassNames';
import { isNewSessionLink } from '../../lib/newSessionLink';
import { newSessionExternalRouteRef } from '../../routes';
import {
  ConnectorSignInAction,
  useConnectorSignInLink,
} from '../ConnectorSignInLinks';
import {
  chatRehypePlugins,
  chatRemarkRehypeOptions,
} from './chatRehypePlugins';

/**
 * Styling for agent prose, shared with the AI chat plugin's visual language so
 * both chat surfaces read the same: semantic tables, code blocks on a neutral
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
  // The size and colour are set here, not left to bui's Text: its variant
  // decides the size (body-small is 12px, which made a reply smaller than the
  // user's message beside it, #3396) and its default `color="primary"` sets a
  // colour on the paragraph itself, which a quiet container (a blockquote, the
  // agent's reasoning) could no longer pass down. Unlayered JSS beats bui's
  // `@layer components` rules. 14px, the user's message and table cells' size.
  paragraph: {
    margin: theme.spacing(1, 0),
    lineHeight: 1.6,
    fontSize: '0.875rem',
    color: 'inherit',
  },
  // Inherits its colour for the paragraph's reason.
  heading: {
    color: 'inherit',
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
    // Outlined for the same reason as the user bubble: the light theme's
    // neutrals are nearly the page background.
    border: `1px solid ${theme.palette.divider}`,
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
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  tableCell: {
    fontSize: '0.875rem',
    textAlign: 'left',
    borderBottom: `1px solid ${theme.palette.divider}`,
    lineHeight: 1.6,
    wordBreak: 'initial',
    // The root's `overflow-wrap: anywhere` would shrink a cell's min-content
    // width and break words mid-word; reset, a wide table scrolls instead.
    overflowWrap: 'normal',
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
    border: `1px solid ${theme.palette.divider}`,
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
 * Another origin, or a backend `/api/…` URL, opens in a new tab with the usual
 * external affordance, a fragment stays on the page, a catalog path becomes
 * an entity link, a session filesystem path stays text, an agent's link to
 * start a session (`/?agent=…#prompt=…`) lands on that screen in this tab, and
 * any other same-origin link opens in the app in a new tab, query and fragment
 * kept. A connector sign-in muster issued in the session is the exception: a
 * sign-in action.
 */
function MarkdownLink({
  href,
  children,
}: {
  href?: string;
  children?: React.ReactNode;
}) {
  // A connector sign-in muster issued in this session is shown as the action
  // it is, not as the opaque URL (giantswarm/giantswarm#38774).
  const signIn = useConnectorSignInLink(href);
  const home = useRouteRef(newSessionExternalRouteRef)?.();
  if (signIn) {
    return <ConnectorSignInAction link={signIn} />;
  }
  if (!href) {
    return <>{children}</>;
  }

  // A fragment (a footnote, a heading in the same reply) stays on this page.
  if (href.startsWith('#')) {
    return <a href={href}>{children}</a>;
  }

  let url: URL;
  try {
    // Relative to this page, as the browser would read it.
    url = new URL(href, window.location.href);
  } catch {
    return <>{children}</>;
  }

  // Another origin, or a backend URL the app's router does not serve (an
  // `/api/…` download): the browser fetches it, in a new tab.
  if (
    url.origin !== window.location.origin ||
    /^\/+api(?:\/|$)/.test(url.pathname)
  ) {
    return <ExternalLink href={href}>{children}</ExternalLink>;
  }
  // One leading slash: `//host` in a router link would leave the portal.
  const pathname = url.pathname.replace(/^\/{2,}/, '/');

  if (/^\/(?:workspace|data\/workspace)(?:\/|$)/.test(pathname)) {
    return (
      <span title="This path is inside the agent session, not a portal page.">
        {children} (<code>{pathname}</code>, session file)
      </span>
    );
  }

  const catalogMatch = pathname.match(/^\/catalog\/([^/]+)\/([^/]+)\/([^/]+)/);
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

  const to = `${pathname}${url.search}${url.hash}`;
  // A link to start a session (an agent's handover) lands on that screen in
  // this tab; any other page opens in a new one, so the session and what is
  // typed in it stay.
  return isNewSessionLink(url, home) ? (
    <BackstageLink to={to}>{children}</BackstageLink>
  ) : (
    <BackstageLink to={to} target="_blank" rel="noopener noreferrer">
      {children}
    </BackstageLink>
  );
}

/**
 * The prose styles and element mapping of agent messages, for other Markdown
 * the platform renders in the same visual language (a skill's instructions).
 * Raw HTML is the caller's decision: `MessageMarkdown` allows it, a document
 * read from a repository should not.
 */
export const useMarkdownStyles = useStyles;

export function useMarkdownComponents(): Components {
  const classes = useStyles();
  // Stable across renders: react-markdown uses these as element types, so a
  // new map on each render (each streamed chunk of a reply) would remount every
  // element, closing an opened <details> and dropping a text selection.
  return useMemo<Components>(
    () => ({
      h1: ({ children }) => (
        <Text
          as="h1"
          variant="title-small"
          className={`${classes.heading} ${classes.heading1}`}
        >
          {children}
        </Text>
      ),
      h2: ({ children }) => (
        <Text
          as="h2"
          variant="title-x-small"
          className={`${classes.heading} ${classes.heading2}`}
        >
          {children}
        </Text>
      ),
      h3: ({ children }) => (
        <Text
          as="h3"
          variant="body-large"
          className={`${classes.heading} ${classes.heading3}`}
        >
          {children}
        </Text>
      ),
      h4: ({ children }) => (
        <Text
          as="h4"
          variant="body-large"
          className={`${classes.heading} ${classes.heading4}`}
        >
          {children}
        </Text>
      ),
      h5: ({ children }) => (
        <Text
          as="h5"
          variant="body-medium"
          className={`${classes.heading} ${classes.heading5}`}
        >
          {children}
        </Text>
      ),
      h6: ({ children }) => (
        <Text
          as="h6"
          variant="body-medium"
          className={`${classes.heading} ${classes.heading6}`}
        >
          {children}
        </Text>
      ),
      p: ({ children }) => (
        <Text as="p" variant="body-medium" className={classes.paragraph}>
          {children}
        </Text>
      ),
      a: ({ href, children, node: _node, ...props }) =>
        // An in-page anchor, such as a footnote reference, keeps its id and
        // footnote attributes.
        href?.startsWith('#') ? (
          <a href={href} {...props}>
            {children}
          </a>
        ) : (
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
          <table className={classes.table}>{children}</table>
        </div>
      ),
      thead: ({ children }) => <thead>{children}</thead>,
      tbody: ({ children }) => <tbody>{children}</tbody>,
      tr: ({ children }) => <tr>{children}</tr>,
      th: ({ children }) => <th className={classes.tableCell}>{children}</th>,
      td: ({ children }) => <td className={classes.tableCell}>{children}</td>,
      pre: ({ children }) => (
        <pre className={classes.codeBlock}>{children}</pre>
      ),
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
      img: ({ src, alt }) => {
        const label = `Image: ${alt || 'untitled'}`;
        return typeof src === 'string' && src ? (
          <MarkdownLink href={src}>{label}</MarkdownLink>
        ) : (
          <>{`[${label}]`}</>
        );
      },
    }),
    [classes],
  );
}

/**
 * Agent prose. GFM (tables, task lists, strikethrough) plus sanitised raw
 * HTML for agents' `<details>` blocks. Images render as links, so a message
 * never makes the browser fetch a URL.
 */
function MessageMarkdownImpl({ text }: { text: string }) {
  const classes = useStyles();
  const components = useMarkdownComponents();
  return (
    <div className={`${STABLE_CLASS_NAMES.message} ${classes.root}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={chatRehypePlugins}
        remarkRehypeOptions={chatRemarkRehypeOptions}
        components={components}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

export const MessageMarkdown = memo(MessageMarkdownImpl);
