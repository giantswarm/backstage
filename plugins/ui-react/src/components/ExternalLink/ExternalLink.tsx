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

export const ExternalLink = ({
  href,
  children,
  display = 'inline-flex',
}: ExternalLinkProps) => {
  return (
    <Link href={href} target="_blank" rel="noopener noreferrer">
      <Box display={display} alignItems="center">
        {children}
        <StyledLaunchOutlinedIcon />
      </Box>
    </Link>
  );
};
