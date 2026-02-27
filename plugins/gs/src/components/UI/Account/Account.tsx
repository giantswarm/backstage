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
  colored?: boolean;
};

export const Account = ({ accountId, accountUrl, colored = true }: AccountProps) => {
  const classes = useStyles();

  const formattedAccountId = formatAccountIdForDisplay(accountId);

  const accountComponent = colored ? (
    <ColorWrapper str={accountId}>
      <Typography
        variant="body2"
        className={classes.accountId}
        data-formatted={formattedAccountId}
      >
        {accountId}
      </Typography>
    </ColorWrapper>
  ) : (
    <Typography variant="body2">
      {formattedAccountId}
    </Typography>
  );

  return accountUrl ? (
    <ExternalLink href={accountUrl}>
      {accountComponent}
    </ExternalLink>
  ) : (
    accountComponent
  );
};
