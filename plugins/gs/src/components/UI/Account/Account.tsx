import React from 'react';
import { ColorWrapper, ExternalLink } from '../../UI';
import { Box, Typography } from '@material-ui/core';

type AccountProps = {
  accountId: string;
  accountUrl?: string;
};

export const Account = ({ accountId, accountUrl }: AccountProps) => {
  const accountComponent = (
    <Box display="flex" alignItems="center" gridGap={3}>
      {accountId
        .match(/.{1,4}/g)
        ?.map((group, idx) => <Typography key={idx}>{group}</Typography>)}
    </Box>
  );

  return accountUrl ? (
    <ExternalLink href={accountUrl}>
      <ColorWrapper str={accountId}>{accountComponent}</ColorWrapper>
    </ExternalLink>
  ) : (
    <ColorWrapper str={accountId}>{accountComponent}</ColorWrapper>
  );
};
