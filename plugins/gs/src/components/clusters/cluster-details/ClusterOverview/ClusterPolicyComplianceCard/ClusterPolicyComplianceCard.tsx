import React from 'react';
import { InfoCard } from '@backstage/core-components';
import { Box, Grid, Link, makeStyles, Typography } from '@material-ui/core';
import { CodeBlock } from '../../../../UI';

const useStyles = makeStyles(theme => ({
  withMargin: {
    marginBottom: theme.spacing(1),
  },
}));

export function ClusterPolicyComplianceCard() {
  const classes = useStyles();

  return (
    <InfoCard title="Policy compliance">
      <Grid container direction="column">
        <Grid item>
          <Box>
            <Typography variant="body2" className={classes.withMargin}>
              Detailed policy compliance information for this cluster can be
              accessed through the Policy Reporter user interface.
            </Typography>
            <Typography variant="body2">
              Access to Policy Reporter requires Kubernetes API access. With the
              kubectl context for this cluster selected, run the following
              command:
            </Typography>
            <Box marginTop={1}>
              <CodeBlock
                text="kubectl port-forward -n kyverno svc/kyverno-ui 8099:8080"
                language="bash"
              />
            </Box>
            <Typography variant="body2">
              Then open{' '}
              <Link
                href="http://localhost:8099/"
                target="_blank"
                rel="noopener noreferrer"
              >
                http://localhost:8099/
              </Link>{' '}
              in a web browser.
            </Typography>
          </Box>
        </Grid>
      </Grid>
    </InfoCard>
  );
}
