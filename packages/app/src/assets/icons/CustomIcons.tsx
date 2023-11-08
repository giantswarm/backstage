import { IconComponent } from '@backstage/core-plugin-api';
import { Icon } from '@material-ui/core';
import React from 'react';

export function faIcon(icon: string): IconComponent {
  return (props) => <Icon className={`fa fa-${icon}`} {...props} />;
}
