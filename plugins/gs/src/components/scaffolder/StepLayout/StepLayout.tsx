import { MarkdownContent } from '@backstage/core-components';
import { LayoutTemplate } from '@backstage/plugin-scaffolder-react';
import { Box, Grid, Typography } from '@material-ui/core';
import { useTemplateString } from '../../hooks';
import { QueryClientProvider } from '../../QueryClientProvider';
import { ErrorsProvider } from '@giantswarm/backstage-plugin-kubernetes-react';

export const StepLayout: LayoutTemplate = ({
  properties,
  description,
  formContext,
  uiSchema,
}) => {
  const noteTemplate = (uiSchema?.['ui:options']?.note as string) ?? '';
  const allFormData = (formContext.formData as Record<string, any>) ?? {};
  const note = useTemplateString(noteTemplate, allFormData);

  const formWidth = uiSchema?.['ui:options']?.formWidth;

  return (
    <Box maxWidth={formWidth}>
      {description || note ? (
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
      ) : null}

      <QueryClientProvider>
        <ErrorsProvider>
          <Grid container spacing={3} direction="column">
            {properties.map(element => (
              <Grid key={element.content.key} item xs={12}>
                {element.content}
              </Grid>
            ))}
          </Grid>
        </ErrorsProvider>
      </QueryClientProvider>
    </Box>
  );
};
