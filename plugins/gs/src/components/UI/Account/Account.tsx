import { ColorWrapper, ExternalLink } from '../../UI';
import { Typography } from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';

const useStyles = makeStyles(() => ({
  accountId: {
    fontFamily: 'monospace',
    position: 'relative',
    userSelect: 'text',
    // Hide the actual content (this will contain the unformatted version for copying)
    color: 'transparent',
    // Use ::before to display the formatted version
    '&::before': {
      content: 'attr(data-formatted)',
      position: 'absolute',
      top: 0,
      left: 0,
      color: 'inherit',
      // Prevent selection of the pseudo-element
      userSelect: 'none',
      pointerEvents: 'none',
    },
    // Make sure the underlying text (for copying) maintains the same dimensions
    whiteSpace: 'nowrap',
  },
}));

type AccountProps = {
  accountId: string;
  accountUrl?: string;
};

export const Account = ({ accountId, accountUrl }: AccountProps) => {
  const classes = useStyles();
  
  // Format the account ID for visual display with spaces every 4 characters
  const formatAccountIdForDisplay = (id: string) => {
    return id.replace(/(.{4})/g, '$1 ').trim();
  };

  const accountComponent = (
    <Typography 
      className={classes.accountId}
      data-formatted={formatAccountIdForDisplay(accountId)}
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
