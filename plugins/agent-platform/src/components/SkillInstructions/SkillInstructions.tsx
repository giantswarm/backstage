import { useMemo, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ExternalLink } from '@giantswarm/backstage-plugin-ui-react';

import {
  useMarkdownComponents,
  useMarkdownStyles,
} from '../SessionTimeline/MessageMarkdown';

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

function InstructionLink({
  href,
  sourceUrl,
  children,
}: {
  href?: string;
  sourceUrl?: string;
  children?: ReactNode;
}) {
  const target = resolveInstructionHref(href, sourceUrl);
  return target ? (
    <ExternalLink href={target}>{children}</ExternalLink>
  ) : (
    <>{children}</>
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
 *   default URL transform still strips `javascript:` and the like.
 */
export function SkillInstructions({
  markdown,
  sourceUrl,
}: SkillInstructionsProps) {
  const classes = useMarkdownStyles();
  const prose = useMarkdownComponents();
  const components = useMemo<Components>(
    () => ({
      ...prose,
      a: ({ href, children }) => (
        <InstructionLink href={href} sourceUrl={sourceUrl}>
          {children}
        </InstructionLink>
      ),
      img: ({ src, alt }) => {
        const label = alt || 'Image';
        const target = resolveInstructionHref(
          typeof src === 'string' ? src : undefined,
          sourceUrl,
        );
        return target ? (
          <ExternalLink href={target}>{`Image: ${label}`}</ExternalLink>
        ) : (
          <>{`[Image: ${label}]`}</>
        );
      },
    }),
    [prose, sourceUrl],
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
