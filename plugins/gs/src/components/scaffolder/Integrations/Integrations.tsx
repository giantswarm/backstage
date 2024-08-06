import React from 'react';
import { LayoutTemplate } from '@backstage/plugin-scaffolder-react';
import { Box, Typography } from '@material-ui/core';

export const Integrations: LayoutTemplate = ({
  properties,
  description,
  formData,
}) => {
  const installationName = formData.deployment.installationName;
  const clusterName = formData.deployment.clusterName;

  return (
    <div>
      <Box marginBottom={2}>
        <Typography variant="subtitle1">{description}</Typography>
        {installationName && clusterName ? (
          <Typography variant="body2">
            <strong>Note: </strong>
            To help reduce costs with your infrastructure deployment, this will
            be deployed to an adjacent VPC in the same region, using the same
            availability zones as{' '}
            <code>
              {installationName}/{clusterName}
            </code>
            .
          </Typography>
        ) : null}
      </Box>

      {properties.map(element => (
        <div className="property-wrapper">{element.content}</div>
      ))}
    </div>
  );
};
