import { ExternalLink } from '@giantswarm/backstage-plugin-ui-react';
import { ColorWrapper } from '../../UI';
import { Typography } from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';

const useStyles = makeStyles(() => ({
  accountId: {
    position: 'relative',
    userSelect: 'text',
    color: 'transparent',
    whiteSpace: 'nowrap',
    display: 'inline-block',
    letterSpacing: '0.7px',

    '&::before': {
      content: 'attr(data-formatted)',
      position: 'absolute',
      top: 0,
      left: 0,
      color: 'white',
      userSelect: 'none',
      pointerEvents: 'none',
      whiteSpace: 'nowrap',
      letterSpacing: 'normal',
    },

    'a &:hover::before': {
      textDecoration: 'underline',
    },
  },
}));

// Format the account ID for visual display with spaces every 4 characters
const formatAccountIdForDisplay = (id: string) => {
  return id.replace(/(.{4})/g, '$1 ').trim();
};

type AccountProps = {
  accountId: string;
  accountUrl?: string;
};

export const Account = ({ accountId, accountUrl }: AccountProps) => {
  const classes = useStyles();

  const formattedAccountId = formatAccountIdForDisplay(accountId);

  const accountComponent = (
    <Typography
      variant="body2"
      className={classes.accountId}
      data-formatted={formattedAccountId}
    >
      {accountId}
    </Typography>
  );

  return accountUrl ? (
    <ExternalLink href={accountUrl}>
      <ColorWrapper str={accountId}>{accountComponent}</ColorWrapper>
    </ExternalLink>
  ) : (
    <ColorWrapper str={accountId}>{accountComponent}</ColorWrapper>
  );
};
