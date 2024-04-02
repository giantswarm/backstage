import React from 'react';
import { Card, CardContent, Grid } from '@material-ui/core';
import { ContentRow, Version } from '../../UI';

type RevisionDetailsProps = {
  lastAppliedRevision: string;
  lastAttemptedRevision: string;
  sourceLocation?: string;
};

export const RevisionDetails = ({
  lastAppliedRevision,
  lastAttemptedRevision,
  sourceLocation,
}: RevisionDetailsProps) => {
  return (
    <Grid container item>
      <Grid item xs={12} sm>
        <Card>
          <CardContent>
            <ContentRow title="Revision last applied">
              <Version
                version={lastAppliedRevision}
                sourceLocation={sourceLocation}
                displayWarning={lastAppliedRevision !== lastAttemptedRevision}
              />
            </ContentRow>
          </CardContent>
        </Card>
      </Grid>
      <Grid item xs={12} sm>
        <Card>
          <CardContent>
            <ContentRow title="Revision last attempted">
              <Version
                version={lastAttemptedRevision}
                sourceLocation={sourceLocation}
              />
            </ContentRow>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
};
