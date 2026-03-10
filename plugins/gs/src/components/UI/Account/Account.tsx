import classNames from 'classnames';
import { ExternalLink } from '@giantswarm/backstage-plugin-ui-react';
import { ColorWrapper } from '../../UI';
import { Typography } from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';

const useStyles = makeStyles(theme => ({
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
      color: theme.palette.text.primary,
      userSelect: 'none',
      pointerEvents: 'none',
      whiteSpace: 'nowrap',
      letterSpacing: 'normal',
    },

    'a &:hover::before': {
      textDecoration: 'underline',
    },
  },

  linked: {
    '&::before': {
      color: theme.palette.primary.main,
    },
  },

  colored: {
    '&::before': {
      color: 'white',
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

export const Account = ({
  accountId,
  accountUrl,
  colored = true,
}: AccountProps) => {
  const classes = useStyles();

  const formattedAccountId = formatAccountIdForDisplay(accountId);

  const accountContent = (
    <Typography
      variant="inherit"
      className={classNames(classes.accountId, {
        [classes.colored]: colored,
        [classes.linked]: Boolean(accountUrl),
      })}
      data-formatted={formattedAccountId}
    >
      {accountId}
    </Typography>
  );

  const accountComponent = colored ? (
    <ColorWrapper str={accountId}>{accountContent}</ColorWrapper>
  ) : (
    accountContent
  );

  return accountUrl ? (
    <ExternalLink href={accountUrl}>{accountComponent}</ExternalLink>
  ) : (
    accountComponent
  );
};
