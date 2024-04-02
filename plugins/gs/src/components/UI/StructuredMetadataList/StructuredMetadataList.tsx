import React from 'react';
import { Grid } from '@material-ui/core';
import { ContentRow } from '../ContentRow';

type StructuredMetadataListProps = {
  metadata: { [key: string]: any };
};

export const StructuredMetadataList = ({
  metadata,
}: StructuredMetadataListProps) => {
  return (
    <Grid container direction="column">
      {Object.entries(metadata).map(([key, value]) => (
        <Grid item key={key}>
          <ContentRow title={key}>{value}</ContentRow>
        </Grid>
      ))}
    </Grid>
  );
};
