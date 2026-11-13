import type { ReactNode } from 'react';
import { Link, type LinkProps } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import classNames from 'classnames';
import { NewTabHint } from '../NewTabHint';

export type ExternalLinkProps = {
  href: string;
  children: ReactNode;
  /**
   * How the link lays out its text and the icon.
   * Use 'flex' (block-level) when the link needs to participate in a width
   * constraint chain (e.g. inside a flex/grid item for text truncation).
   * Use 'inline' for a link in running text, so a long link text wraps with
   * the sentence and the icon follows its last word.
   * @default 'inline-flex'
   */
  display?: 'flex' | 'inline-flex' | 'inline';
  /**
   * bui's text variant. Without one the link takes the font of the text
   * around it (a fact's value, a sentence), as a link in that text should.
   */
  variant?: LinkProps['variant'];
  /** A tooltip, e.g. the whole text of a truncated link. */
  title?: string;
};

const useStyles = makeStyles(theme => ({
  // Off the shell, the classic theme's link colour, as MUI's Link had it;
  // inside the shell, the shell's link rule (agent-shell.css) wins.
  root: {
    color: theme.palette.primary.main,
  },
  // bui's Link sets a size, weight and family of its own; without a variant
  // the link is part of the text around it.
  inheritFont: {
    fontFamily: 'inherit',
    fontSize: 'inherit',
    fontWeight: 'inherit',
    lineHeight: 'inherit',
  },
  inline: {
    display: 'inline',
  },
  'inline-flex': {
    display: 'inline-flex',
    alignItems: 'center',
  },
  flex: {
    display: 'flex',
    alignItems: 'center',
    minWidth: 0,
  },
}));

/**
 * A link that opens in a new tab: for a link leaving the app, and for any
 * link inside a form with input to keep, so following it leaves the form
 * where it is. The launch icon says so to the eye and "(opens in a new tab)"
 * to a screen reader, so the tab switch is no surprise. bui's `Link`, with
 * its underline and focus ring.
 */
export const ExternalLink = ({
  href,
  children,
  display = 'inline-flex',
  variant,
  title,
}: ExternalLinkProps) => {
  const classes = useStyles();
  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      variant={variant}
      title={title}
      className={classNames(
        classes.root,
        classes[display],
        !variant && classes.inheritFont,
      )}
    >
      {children}
      <NewTabHint />
    </Link>
  );
};
