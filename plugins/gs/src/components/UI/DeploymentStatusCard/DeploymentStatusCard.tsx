import React, { ComponentProps, ComponentType } from 'react';
import { Box, Card, CardContent, CardHeader, styled } from '@material-ui/core';
import { Heading } from '../Heading';
import { DateComponent } from '../Date';

const IconWrapper = styled('div')(({ color }) => ({
  display: 'flex',
  marginRight: 10,
  color,
})) as ComponentType<ComponentProps<'div'>>;

export const DeploymentStatusCard = ({
  label,
  icon,
  iconColor,
  lastTransitionTime,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  iconColor: string;
  lastTransitionTime?: string;
  children: React.ReactNode;
}) => {
  return (
    <Card>
      <CardHeader
        title={
          <Box display="flex" alignItems="center">
            <IconWrapper color={iconColor}>{icon}</IconWrapper>
            <Heading>{label}</Heading>
          </Box>
        }
        titleTypographyProps={{ variant: undefined }}
        subheader={
          lastTransitionTime ? (
            <DateComponent value={lastTransitionTime} relative />
          ) : undefined
        }
        subheaderTypographyProps={{
          variant: 'body2',
          color: 'textPrimary',
        }}
      />
      {children ? <CardContent>{children}</CardContent> : <Box padding={1} />}
    </Card>
  );
};
