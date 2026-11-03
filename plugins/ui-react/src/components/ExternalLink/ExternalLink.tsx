import { VisuallyHidden } from '@backstage/ui';
import { Box, Link, styled } from '@material-ui/core';
import LaunchOutlinedIcon from '@material-ui/icons/LaunchOutlined';

const StyledLaunchOutlinedIcon = styled(LaunchOutlinedIcon)(({ theme }) => ({
  marginLeft: theme.spacing(0.5),
  fontSize: 'inherit',
}));

type ExternalLinkProps = {
  href: string;
  children: React.ReactNode;
  /**
   * CSS display value for the inner flex container.
   * Use 'flex' (block-level) when the link needs to participate in a width
   * constraint chain (e.g. inside a flex/grid item for text truncation).
   * @default 'inline-flex'
   */
  display?: 'flex' | 'inline-flex';
};

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
  return (
    <Link href={href} target="_blank" rel="noopener noreferrer">
      <Box display={display} alignItems="center">
        {children}
        <StyledLaunchOutlinedIcon aria-hidden />
        <VisuallyHidden> (opens in a new tab)</VisuallyHidden>
      </Box>
    </Link>
  );
};
