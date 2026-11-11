import { Box, Tooltip, Typography, styled } from '@material-ui/core';
import LanguageOutlinedIcon from '@material-ui/icons/LanguageOutlined';
import { ExternalLink } from '@giantswarm/backstage-plugin-ui-react';

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
    <ExternalLink href={linkUrl}>
      {tooltip ? <Tooltip title={tooltip}>{el}</Tooltip> : el}
    </ExternalLink>
  );
};
