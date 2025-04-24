import { Box, Link, styled } from '@material-ui/core';
import LaunchOutlinedIcon from '@material-ui/icons/LaunchOutlined';

const StyledLaunchOutlinedIcon = styled(LaunchOutlinedIcon)(({ theme }) => ({
  marginLeft: theme.spacing(0.5),
  fontSize: 'inherit',
}));

type ExternalLinkProps = {
  href: string;
  children: React.ReactNode;
};

export const ExternalLink = ({ href, children }: ExternalLinkProps) => {
  return (
    <Link href={href} target="_blank" rel="noopener noreferrer">
      <Box display="flex" alignItems="center">
        {children}
        <StyledLaunchOutlinedIcon />
      </Box>
    </Link>
  );
};
