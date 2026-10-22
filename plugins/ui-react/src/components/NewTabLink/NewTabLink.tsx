import type { ReactNode } from 'react';
import { Link, VisuallyHidden } from '@backstage/ui';
import { makeStyles } from '@material-ui/core/styles';
import LaunchOutlinedIcon from '@material-ui/icons/LaunchOutlined';

const useStyles = makeStyles({
  icon: {
    fontSize: 'inherit',
    marginLeft: 2,
    verticalAlign: 'middle',
  },
});

export type NewTabLinkProps = {
  /** Absolute, in the app or outside it. */
  href: string;
  children: ReactNode;
  variant?: 'body-small' | 'body-medium';
};

/**
 * A bui link that opens in a new tab, for a link inside a form with input to
 * keep: following it leaves the form where it is. The launch icon says so to
 * the eye and "(opens in a new tab)" to a screen reader, so the tab switch is
 * no surprise.
 */
export function NewTabLink({ href, children, variant }: NewTabLinkProps) {
  const classes = useStyles();
  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      variant={variant}
    >
      {children}
      <LaunchOutlinedIcon className={classes.icon} aria-hidden />
      <VisuallyHidden> (opens in a new tab)</VisuallyHidden>
    </Link>
  );
}
