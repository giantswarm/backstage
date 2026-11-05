import { Box, Link, makeStyles } from '@material-ui/core';
import { NewTabHint } from './NewTabHint';

type ExternalLinkProps = {
  href: string;
  children: React.ReactNode;
  /**
   * CSS display value for the inner container.
   * Use 'flex' (block-level) when the link needs to participate in a width
   * constraint chain (e.g. inside a flex/grid item for text truncation).
   * Use 'inline' for a link in running text, so a long link text wraps with
   * the sentence and the icon follows its last word.
   * @default 'inline-flex'
   */
  display?: 'flex' | 'inline-flex' | 'inline';
};

const useStyles = makeStyles({
  // The design system's focus ring, as bui's `Link` draws it, so a keyboard
  // user sees the same ring on this link as on the bui links around it.
  root: {
    '&:focus-visible': {
      outline: '2px solid var(--bui-ring)',
      outlineOffset: 2,
    },
  },
});

/**
 * A link that opens in a new tab: for a link leaving the app, and for any
 * link inside a form with input to keep, so following it leaves the form
 * where it is. The launch icon says so to the eye and "(opens in a new tab)"
 * to a screen reader, so the tab switch is no surprise.
 */
export const ExternalLink = ({
  href,
  children,
  display = 'inline-flex',
}: ExternalLinkProps) => {
  const classes = useStyles();
  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={classes.root}
    >
      {/* An underline does not reach into an inline-flex box, so the box
          takes its link's own (the agent shell's solid one, MUI's on
          hover). */}
      <Box
        component={display === 'inline' ? 'span' : 'div'}
        display={display}
        alignItems={display === 'inline' ? undefined : 'center'}
        style={{ textDecoration: 'inherit' }}
      >
        {children}
        <NewTabHint />
      </Box>
    </Link>
  );
};
