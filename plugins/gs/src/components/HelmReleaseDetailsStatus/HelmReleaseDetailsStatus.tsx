import React from "react";
import { Box, Card, CardContent, CardHeader, Grid, Paper, styled } from "@material-ui/core";
import { StructuredMetadataList } from "../UI/StructuredMetadataList";
import { IHelmRelease } from "../../model/services/mapi/helmv2beta1";
import DateComponent from "../UI/Date";
import CancelOutlinedIcon from '@material-ui/icons/CancelOutlined';
import CheckCircleOutlinedIcon from '@material-ui/icons/CheckCircleOutlined';
import { Heading } from "../UI/Heading";
import { compareDates } from "../helpers";

const StyledCancelOutlinedIcon = styled(CancelOutlinedIcon)(({ theme }) => ({
  marginRight: 10,
  color: theme.palette.status.error
}));

const StyledCheckCircleOutlinedIcon = styled(CheckCircleOutlinedIcon)(({ theme }) => ({
  marginRight: 10,
  color: theme.palette.status.ok,
}));

type HelmReleaseDetailsStatusProps = {
  helmrelease: IHelmRelease;
}

export const HelmReleaseDetailsStatus = ({
  helmrelease
}: HelmReleaseDetailsStatusProps) => {
  if (!helmrelease.status?.conditions) {
    return (
      <Paper>
        <Box padding={2}>
          <Heading>No status information available</Heading>
        </Box>
      </Paper>
    );
  }

  const conditions = helmrelease.status.conditions.sort(
    (a, b) => compareDates(b.lastTransitionTime, a.lastTransitionTime)
  );

  return (
    <Grid container direction="column">
      {conditions.map((condition) => (
        <Grid item>
          <Card>
            <CardHeader
              title={(
                <Box display='flex' alignItems="center">
                  {condition.status !== 'Unknown' && (condition.status === 'True'
                    ? <StyledCheckCircleOutlinedIcon />
                    : <StyledCancelOutlinedIcon />
                  )}
                  <Heading>{condition.type}</Heading>
                </Box>
              )}
              titleTypographyProps={{ variant: undefined }}
              subheader={<DateComponent value={condition.lastTransitionTime} relative variant="body2" />}
              subheaderTypographyProps={{
                color: 'textPrimary'
              }}
            />
            <CardContent>
              <StructuredMetadataList metadata={{
                'Reason': condition.reason,
                'Message': condition.message,
              }} />
            </CardContent>
          </Card>
        </Grid>
      ))}
    </Grid>
  );
}
