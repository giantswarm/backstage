import React from "react";
import { Box, Divider, makeStyles } from "@material-ui/core";
import classNames from "classnames";
import { StructuredMetadataList } from "../UI/StructuredMetadataList";
import DateComponent from "../UI/Date";

const useStyles = makeStyles((theme) => ({
  divider: {
    margin: theme.spacing(2, 0),
  },
  dividerFirst: {
    marginTop: 0,
  }
}));

type HelmReleaseDetailsConditionsProps = {
  conditions: {
    lastTransitionTime: string;
    message: string;
    reason: string;
    status: 'True' | 'False' | 'Unknown';
    type: string;
  }[];
}

export const HelmReleaseDetailsConditions = ({
  conditions
}: HelmReleaseDetailsConditionsProps) => {
  const classes = useStyles();

  return (
    <Box>
      {conditions.map((condition, idx) => (
        <React.Fragment key={condition.type}>
          <Divider className={classNames(classes.divider, { [classes.dividerFirst]: idx === 0 })} />
          <StructuredMetadataList metadata={{
            'Condition': condition.type,
            'Status': condition.status,
            'Reason': condition.reason,
            'Message': condition.message,
            'Last transition time': <DateComponent value={condition.lastTransitionTime} relative />
          }} />
        </React.Fragment>
      ))}
    </Box>
  );
}
