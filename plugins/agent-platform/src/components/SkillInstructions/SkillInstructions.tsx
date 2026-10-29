import { createContext, useContext, useMemo, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Link } from '@backstage/ui';
import { makeStyles } from '@material-ui/core/styles';
import { ExternalLink } from '@giantswarm/backstage-plugin-ui-react';

import {
  matchSkillFileMention,
  resolveSkillFilePath,
  SKILL_MD,
} from '../../lib/skillFiles';
import {
  useMarkdownComponents,
  useMarkdownStyles,
} from '../SessionTimeline/MessageMarkdown';

const useStyles = makeStyles({
  // A file link sits in prose: the paragraph's type, not bui's body-medium.
  fileLink: {
    fontSize: 'inherit',
    lineHeight: 'inherit',
  },
});

/**
 * The skill's other files, for a document rendered in the Instructions tab's
 * viewer: a relative link or a backticked path that names one of them opens
 * it in the viewer (an in-page address) instead of leaving for the
 * repository.
 */
export type SkillFileLinks = {
  /** The skill's listed files, relative to the skill directory. */
  paths: ReadonlySet<string>;
  /** The page address that shows one of them in the viewer. */
  hrefFor: (path: string) => string;
  /**
   * The file this document is, relative to the skill directory, which
   * relative links resolve against. Default `SKILL.md`.
   */
  from?: string;
};

/** Set inside a rendered link, so code within it does not nest a second one. */
const InsideLink = createContext(false);

/**
 * Where a link in a SKILL.md goes, or undefined to render it as plain text.
 *
 * Absolute `http(s)`/`mailto` links open in a new tab. A relative link points
 * into the skill's folder (`references/setup.md`), so it resolves against the
 * skill's source in the repository when there is one to resolve against —
 * never against the portal, where it would land on a page that does not
 * exist. An in-page anchor has no target here (headings carry no ids), and
 * anything else (other schemes, a root-relative path) stays text.
 */
export function resolveInstructionHref(
  href: string | undefined,
  sourceUrl: string | undefined,
): string | undefined {
  if (!href || href.startsWith('#')) {
    return undefined;
  }
  if (/^(https?:|mailto:)/i.test(href)) {
    return href;
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith('/') || !sourceUrl) {
    return undefined;
  }
  try {
    return new URL(href, `${sourceUrl.replace(/\/+$/, '')}/`).toString();
  } catch {
    return undefined;
  }
}

/** The listed file a relative reference names, if file links are on. */
function linkedFile(
  href: string | undefined,
  fileLinks: SkillFileLinks | undefined,
): string | undefined {
  if (!fileLinks) {
    return undefined;
  }
  const path = resolveSkillFilePath(href, fileLinks.from ?? SKILL_MD);
  return path && fileLinks.paths.has(path) ? path : undefined;
}

/** A link to one of the skill's files, opening it in the viewer. */
function FileLink({ href, children }: { href: string; children: ReactNode }) {
  const classes = useStyles();
  return (
    <InsideLink.Provider value>
      <Link href={href} className={classes.fileLink}>
        {children}
      </Link>
    </InsideLink.Provider>
  );
}

function InstructionLink({
  href,
  sourceUrl,
  fileLinks,
  children,
}: {
  href?: string;
  sourceUrl?: string;
  fileLinks?: SkillFileLinks;
  children?: ReactNode;
}) {
  const file = linkedFile(href, fileLinks);
  if (file && fileLinks) {
    return <FileLink href={fileLinks.hrefFor(file)}>{children}</FileLink>;
  }
  const target = resolveInstructionHref(href, sourceUrl);
  return target ? (
    <InsideLink.Provider value>
      <ExternalLink href={target}>{children}</ExternalLink>
    </InsideLink.Provider>
  ) : (
    <>{children}</>
  );
}

/**
 * Inline code; when it is exactly the path of one of the skill's files (and
 * not already inside a link), a link to it in the viewer.
 */
function InlineCode({
  text,
  className,
  fileLinks,
  children,
}: {
  text: string;
  className: string;
  fileLinks?: SkillFileLinks;
  children?: ReactNode;
}) {
  const insideLink = useContext(InsideLink);
  const file =
    fileLinks && !insideLink
      ? matchSkillFileMention(text, fileLinks.paths, fileLinks.from)
      : undefined;
  const code = <code className={className}>{children}</code>;
  return file && fileLinks ? (
    <FileLink href={fileLinks.hrefFor(file)}>{code}</FileLink>
  ) : (
    code
  );
}

export type SkillInstructionsProps = {
  /** The SKILL.md body under its frontmatter. */
  markdown: string;
  /**
   * The skill's folder in the repository at its pinned commit, which relative
   * links and images resolve against. Absent: they render as text.
   */
  sourceUrl?: string;
  /**
   * The skill's files, when the viewer shows them: links and backticked paths
   * naming one open it there. Absent: relative links go to `sourceUrl`.
   */
  fileLinks?: SkillFileLinks;
};

/**
 * A skill's instructions — its SKILL.md body — rendered as a document, in the
 * chat's Markdown look (GFM: tables, task lists, code blocks) but read from a
 * repository, not written by the agent the reader is talking to, so stricter:
 *
 * - **no raw HTML** (`skipHtml`; no `rehype-raw`, which the chat allows for
 *   agents' `<details>` blocks) — markup in a SKILL.md is dropped, not run;
 * - **no remote loads**: an image becomes a link to it (by its alt text), so
 *   opening a skill's page fetches nothing from wherever its author pointed;
 * - links resolve as {@link resolveInstructionHref} says, and react-markdown's
 *   default URL transform still strips `javascript:` and the like;
 * - with `fileLinks`, a relative link, an image or a backticked path that
 *   names one of the skill's listed files opens it in the viewer instead;
 *   a path outside the skill directory keeps its repository link.
 */
export function SkillInstructions({
  markdown,
  sourceUrl,
  fileLinks,
}: SkillInstructionsProps) {
  const classes = useMarkdownStyles();
  const prose = useMarkdownComponents();
  const components = useMemo<Components>(
    () => ({
      ...prose,
      a: ({ href, children }) => (
        <InstructionLink
          href={href}
          sourceUrl={sourceUrl}
          fileLinks={fileLinks}
        >
          {children}
        </InstructionLink>
      ),
      code: ({ children, className }) => {
        const text = String(children);
        // A fenced block arrives as `pre > code` and keeps the pre's styling
        // (as in the chat); only inline code is a chip, and maybe a link.
        if (text.includes('\n')) {
          return <code className={className}>{children}</code>;
        }
        return (
          <InlineCode
            text={text}
            className={classes.inlineCode}
            fileLinks={fileLinks}
          >
            {children}
          </InlineCode>
        );
      },
      img: ({ src, alt }) => {
        const label = alt || 'Image';
        const source = typeof src === 'string' ? src : undefined;
        const file = linkedFile(source, fileLinks);
        if (file && fileLinks) {
          return (
            <FileLink
              href={fileLinks.hrefFor(file)}
            >{`Image: ${label}`}</FileLink>
          );
        }
        const target = resolveInstructionHref(source, sourceUrl);
        return target ? (
          <ExternalLink href={target}>{`Image: ${label}`}</ExternalLink>
        ) : (
          <>{`[Image: ${label}]`}</>
        );
      },
    }),
    [prose, sourceUrl, fileLinks, classes.inlineCode],
  );

  return (
    <div className={classes.root} data-testid="skill-instructions">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={components}
        skipHtml
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
