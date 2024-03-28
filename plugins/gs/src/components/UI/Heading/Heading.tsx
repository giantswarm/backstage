import { Typography, styled } from '@material-ui/core';

export const Heading = styled(Typography)(
  ({ theme }) => ({
    ...theme.typography.h6,
    marginBottom: 0,
    fontSize: '1.125rem',
  }),
  { name: 'Heading' },
);
