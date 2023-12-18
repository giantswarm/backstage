import React from "react";
import { Card, CardContent, Grid } from "@material-ui/core";
import { ContentRow } from "../UI/ContentRow";
import { Version } from "../UI/Version";

type RevisionDetailsProps = {
  lastAppliedRevision: string;
  lastAttemptedRevision: string;
  projectSlug?: string;
};

export const RevisionDetails = ({
  lastAppliedRevision,
  lastAttemptedRevision,
  projectSlug,
}: RevisionDetailsProps) => {
  return (
    <Grid container>
      <Grid item xs={12} sm>
        <Card>
          <CardContent>
            <ContentRow title="Revision last applied">
              <Version
                version={lastAppliedRevision}
                projectSlug={projectSlug}
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
              <Version version={lastAttemptedRevision} projectSlug={projectSlug} />
            </ContentRow>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
}
