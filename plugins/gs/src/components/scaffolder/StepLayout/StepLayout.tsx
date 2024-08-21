import React from 'react';
import { MarkdownContent } from '@backstage/core-components';
import { LayoutTemplate } from '@backstage/plugin-scaffolder-react';
import { Box, Grid, Typography } from '@material-ui/core';
import { formatTemplateString } from '../../utils/formatTemplateString';

export const StepLayout: LayoutTemplate = ({
  properties,
  description,
  formContext,
  uiSchema,
}) => {
  const noteTemplate = (uiSchema?.['ui:options']?.note as string) ?? '';
  const note = formatTemplateString(
    noteTemplate,
    (formContext.formData as Record<string, any>) ?? {},
  );

  const formWidth = uiSchema?.['ui:options']?.formWidth;

  return (
    <Box maxWidth={formWidth}>
      <Box marginBottom={2}>
        {description ? (
          <Typography variant="subtitle1" component="p">
            {description}
          </Typography>
        ) : null}
        {note ? (
          <Typography variant="body2">
            <MarkdownContent content={note} />
          </Typography>
        ) : null}
      </Box>

      <Grid container spacing={3} direction="column">
        {properties.map(element => (
          <Grid key={element.content.key} item>
            {element.content}
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};
