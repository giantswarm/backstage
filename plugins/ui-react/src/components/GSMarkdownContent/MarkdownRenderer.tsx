import {
  Children,
  ComponentProps,
  createElement,
  ReactElement,
  ReactNode,
} from 'react';
import ReactMarkdown from 'react-markdown';
import gfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { CodeSnippet, Link } from '@backstage/core-components';
import { makeStyles } from '@material-ui/core/styles';
import { MermaidDiagram } from '../MermaidDiagram';

// The renderer of core-components' `MarkdownContent` (the same react-markdown,
// remark-gfm, rehype-raw and rehype-sanitize releases, components and table
// styles), which takes no component override, plus one: a ```mermaid block
// renders as its diagram. One parse keeps every document-wide construct
// (HTML blocks, footnotes, lists, reference definitions) intact around it.

type Components = ComponentProps<typeof ReactMarkdown>['components'];

/** The hast element react-markdown hands a component as `node`. */
type HastNode = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: { className?: unknown };
  children?: HastNode[];
};

const useStyles = makeStyles(theme => ({
  markdown: {
    '& table': {
      borderCollapse: 'collapse',
      border: `1px solid ${theme.palette.border}`,
    },
    '& th, & td': {
      border: `1px solid ${theme.palette.border}`,
      padding: theme.spacing(1),
    },
    '& td': {
      wordBreak: 'break-word',
      overflow: 'hidden',
      verticalAlign: 'middle',
      lineHeight: '1',
      margin: 0,
      padding: theme.spacing(3, 2, 3, 2.5),
      borderBottom: 0,
    },
    '& th': {
      backgroundColor: theme.palette.background.paper,
    },
    '& tr': {
      backgroundColor: theme.palette.background.paper,
    },
    '& tr:nth-child(odd)': {
      backgroundColor: theme.palette.background.default,
    },
    '& a': {
      color: theme.palette.link,
    },
    '& img': {
      maxWidth: '100%',
    },
  },
}));

const textOf = (node: HastNode): string =>
  node.type === 'text'
    ? (node.value ?? '')
    : (node.children ?? []).map(textOf).join('');

const classNamesOf = (node: HastNode) => {
  const className = node.properties?.className;
  return Array.isArray(className) ? className.map(String) : [];
};

/** The source of a `<pre><code class="language-mermaid">` block, if it is one. */
function mermaidSource(pre: HastNode | undefined) {
  const code = pre?.children?.find(child => child.type === 'element');
  if (code?.tagName !== 'code') return undefined;
  if (!classNamesOf(code).includes('language-mermaid')) return undefined;
  return textOf(code).replace(/\n+$/, '');
}

const flatten = (text: string, child: ReactNode): string => {
  if (!child) return text;
  return typeof child === 'string'
    ? text + child
    : Children.toArray((child as ReactElement).props.children).reduce(
        flatten,
        text,
      );
};

const heading = ({
  level,
  children,
}: {
  level: number;
  children: ReactNode;
}) => {
  const text = Children.toArray(children).reduce(flatten, '');
  const slug = text.toLowerCase().replace(/\W/g, '-');
  return createElement(`h${level}`, { id: slug }, children);
};

const components: Components = {
  pre: ({ node, children, ...props }) => {
    const source = mermaidSource(node as HastNode);
    return source === undefined ? (
      <pre {...props}>{children}</pre>
    ) : (
      <MermaidDiagram source={source} />
    );
  },
  code: ({ inline, className, children, node: _node, ...props }) => {
    const text = String(children).replace(/\n+$/, '');
    const match = /language-(\w+)/.exec(className || '');
    return !inline && match ? (
      <CodeSnippet language={match[1]} text={text} />
    ) : (
      <code className={className} {...props}>
        {children}
      </code>
    );
  },
  h1: heading,
  h2: heading,
  h3: heading,
  h4: heading,
  h5: heading,
  h6: heading,
  a: ({ href, children, title, target, rel }) =>
    href ? (
      <Link
        to={href}
        title={title}
        {...(target ? { target } : {})}
        {...(rel ? { rel } : {})}
      >
        {children}
      </Link>
    ) : (
      <>{children}</>
    ),
};

const gfmRehypePlugins: ComponentProps<typeof ReactMarkdown>['rehypePlugins'] =
  [
    [rehypeRaw, { tagfilter: true }],
    [
      rehypeSanitize,
      {
        ...defaultSchema,
        attributes: {
          ...defaultSchema.attributes,
          // Keeps the language classes the code renderers read.
          code: [...(defaultSchema.attributes?.code ?? []), ['className']],
        },
      },
    ],
  ];

export type MarkdownRendererProps = {
  content: string;
  dialect: 'gfm' | 'common-mark';
  transformLinkUri?: ComponentProps<typeof ReactMarkdown>['transformLinkUri'];
};

export const MarkdownRenderer = ({
  content,
  dialect,
  transformLinkUri,
}: MarkdownRendererProps) => {
  const classes = useStyles();
  return (
    <ReactMarkdown
      remarkPlugins={dialect === 'gfm' ? [gfm] : []}
      rehypePlugins={dialect === 'gfm' ? gfmRehypePlugins : []}
      className={classes.markdown}
      components={components}
      transformLinkUri={transformLinkUri}
    >
      {content}
    </ReactMarkdown>
  );
};
