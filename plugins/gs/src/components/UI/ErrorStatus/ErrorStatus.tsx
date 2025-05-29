import { Box, styled, Tooltip } from '@material-ui/core';
import { NotAvailable } from '../NotAvailable';
import ErrorOutlineIcon from '@material-ui/icons/ErrorOutline';

const ErrorIcon = styled(ErrorOutlineIcon)(({ theme }) => ({
  display: 'flex',
  color: theme.palette.status.error,
  fontSize: '1.25rem',
}));

type ErrorStatusProps = {
  errorMessage: string;
  notAvailable?: boolean;
};

export const ErrorStatus = ({
  errorMessage,
  notAvailable = true,
}: ErrorStatusProps) => {
  return (
    <Box display="flex" alignItems="center">
      {notAvailable && <NotAvailable />}
      <Tooltip title={errorMessage}>
        <Box marginLeft={notAvailable ? 1 : 0}>
          <ErrorIcon />
        </Box>
      </Tooltip>
    </Box>
  );
};
