import React from "react";
import { Box, Card, CardContent, CardHeader, Paper, styled } from "@material-ui/core";
import DateComponent from "../UI/Date";
import CancelOutlinedIcon from '@material-ui/icons/CancelOutlined';
import CheckCircleOutlinedIcon from '@material-ui/icons/CheckCircleOutlined';
import { Heading } from "../UI/Heading";
import {
  IApp,
  getAppStatus,
  statusDeployed,
} from '../../model/services/mapi/applicationv1alpha1';
import { toSentenceCase } from "../helpers";
import { ContentRow } from "../UI/ContentRow";

const StyledCancelOutlinedIcon = styled(CancelOutlinedIcon)(({ theme }) => ({
  marginRight: 10,
  color: theme.palette.status.error
}));

const StyledCheckCircleOutlinedIcon = styled(CheckCircleOutlinedIcon)(({ theme }) => ({
  marginRight: 10,
  color: theme.palette.status.ok,
}));

type AppDetailsStatusProps = {
  app: IApp;
}

export const AppDetailsStatus = ({
  app
}: AppDetailsStatusProps) => {
  if (!app.status) {
    return (
      <Paper>
        <Box padding={2}>
          <Heading>No status information available</Heading>
        </Box>
      </Paper>
    );
  }

  const status = getAppStatus(app);
  const statusLabel = toSentenceCase(status.replace(/-/g, ' '));

  return (
    <Card>
      <CardHeader
        title={(
          <>
            {status === statusDeployed
              ? (
                <Box display='flex' alignItems="center">
                  <StyledCheckCircleOutlinedIcon />
                  <Heading>{statusLabel}</Heading>
                </Box>
              )
              : (
                <Box display='flex' alignItems="center">
                  <StyledCancelOutlinedIcon />
                  <Heading>{statusLabel}</Heading>
                </Box>
              )}
          </>
        )}
        titleTypographyProps={{ variant: undefined }}
        subheader={<DateComponent value={app.status.release.lastDeployed} relative variant="body2" />}
        subheaderTypographyProps={{
          color: 'textPrimary'
        }}
      />
      {app.status.release.reason ? (
        <CardContent>    
          <ContentRow title="Reason">
            {app.status.release.reason}
          </ContentRow>
        </CardContent>
      ) : (
        <Box padding={1} />
      )}
    </Card>
  );
}
