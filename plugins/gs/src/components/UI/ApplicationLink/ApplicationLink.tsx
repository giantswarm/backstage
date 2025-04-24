import { Box, Link, Tooltip, Typography, styled } from '@material-ui/core';
import LanguageOutlinedIcon from '@material-ui/icons/LanguageOutlined';

const StyledIcon = styled(LanguageOutlinedIcon)(({ theme }) => ({
  marginRight: theme.spacing(0.5),
  fontSize: 'inherit',
  verticalAlign: 'top',
}));

type GrafanaDashboardLinkProps = {
  ingressHost: string;
  text?: string;
  tooltip?: string;
};

export const ApplicationLink = ({
  ingressHost,
  text,
  tooltip,
}: GrafanaDashboardLinkProps) => {
  const linkUrl = `https://${ingressHost}`;

  const el = (
    <Typography variant="inherit" noWrap>
      <Box display="flex" alignItems="center">
        <StyledIcon /> {text ?? 'Endpoint'}
      </Box>
    </Typography>
  );

  return (
    <Link href={linkUrl} target="_blank" rel="noopener noreferrer">
      {tooltip ? <Tooltip title={tooltip}>{el}</Tooltip> : el}
    </Link>
  );
};
